/**
 * Romanisation: the conventional spelling, kept separate from the IPA.
 *
 * Every stage stores BOTH. That separation is the whole mechanism behind
 * orthographic depth. While a language's spelling tracks its pronunciation the
 * two stay in step; once the spelling is frozen at standardisation, sound
 * change carries on underneath it and the gap widens. English "knight" was
 * spelled honestly in 1400 — /knixt/, every letter pronounced. The spelling
 * stopped moving and the pronunciation didn't.
 *
 * So this module produces a *transparent* orthography for a given inventory.
 * Depth is not designed in; it accumulates, later, from the freeze.
 */

import { isVowel } from '../features.js';

/**
 * Preferred Latin spellings, in rough order of how conventional each is.
 * The generator walks these in order and takes the first spelling not already
 * claimed by another phoneme, so common segments get the short letters and the
 * leftovers get digraphs.
 */
const PREFERENCES = {
    p: ['p'], b: ['b'], t: ['t'], d: ['d'], k: ['k', 'c'], 'ɡ': ['g'],
    q: ['q'], 'ʔ': ["'", 'q'],
    'p͡ɸ': ['pf'], 'b͡β': ['bv'],
    'f': ['f'], 'v': ['v'], 'θ': ['th'], 'ð': ['dh'],
    's': ['s'], 'z': ['z'], 'ʃ': ['sh'], 'ʒ': ['zh'],
    'ʂ': ['sh', 'sr'], 'ʐ': ['zh', 'zr'], 'ɕ': ['x', 'sy'], 'ʑ': ['j', 'zy'],
    'ç': ['hy'], 'ʝ': ['yh'], 'x': ['kh'], 'ɣ': ['gh'],
    'χ': ['kh'], 'ʁ': ['gh'], 'ħ': ['hh'], 'ʕ': ['`'], 'h': ['h'], 'ɦ': ['h'],
    't͡s': ['ts', 'z'], 'd͡z': ['dz'], 't͡ʃ': ['ch'], 'd͡ʒ': ['j'],
    't͡ɕ': ['q', 'ch'], 'd͡ʑ': ['j', 'zh'], 'ʈ͡ʂ': ['zh', 'tr'], 'ɖ͡ʐ': ['dr'],
    'm': ['m'], 'n': ['n'], 'ɲ': ['ny'], 'ŋ': ['ng'], 'ɳ': ['nr'], 'ɴ': ['nq'],
    'r': ['r'], 'ɾ': ['r'], 'ʀ': ['rr'], 'ɻ': ['r'], 'ɽ': ['rd'],
    'l': ['l'], 'ɭ': ['lr'], 'ʎ': ['ly'], 'ʟ': ['lg'], 'ɬ': ['hl'], 'ɮ': ['dl'],
    'j': ['y', 'j'], 'w': ['w'], 'ɥ': ['yw'], 'ɰ': ['gw'], 'ʋ': ['v'], 'ɹ': ['r'],
    // Vowels get MULTIPLE candidates on purpose. With one candidate each, the
    // first collision fell through to appending a digit, and a name spelled
    // "He2hwo" is not a name anyone can use.
    'i': ['i', 'y', 'ie'], 'e': ['e', 'ei', 'eh'], 'a': ['a', 'ah', 'aa'],
    'o': ['o', 'oh', 'oa'], 'u': ['u', 'ou', 'oo'],
    'ɨ': ['y', 'ii', 'yh'], 'ʉ': ['uu', 'uy'], 'ɯ': ['w', 'uh', 'eu'], 'y': ['ü', 'yu', 'iu'],
    'ø': ['ö', 'oe', 'eo'], 'ɵ': ['oe', 'ue'], 'ɘ': ['eh', 'ee'], 'ɤ': ['e', 'eu', 'uh'],
    'ə': ['e', 'ë', 'a'], 'ɛ': ['e', 'ê', 'ae'], 'œ': ['oe', 'eu'], 'ɜ': ['er', 'ea'],
    'ʌ': ['u', 'â', 'uh'], 'ɔ': ['o', 'ô', 'aw'], 'ɑ': ['a', 'â', 'ar'],
    'ɒ': ['o', 'au'], 'ä': ['a', 'aa'], 'ɶ': ['ae', 'oe'],
    // The mid row. Without these, a vowel lowered or raised by a chain shift
    // missed the table and spelled itself as raw IPA inside a name.
    'e̞': ['e', 'eh', 'ea'], 'o̞': ['o', 'oh', 'oa'],
    'ø̞': ['oe', 'eo'], 'ɤ̞': ['eu', 'uh'], 'ɵ̞': ['ue', 'oe'],
};

/**
 * Everything that is a MODIFICATION of a base vowel rather than a vowel of its
 * own: the Chao tone letters, length, nasalisation, and the combining marks.
 *
 * These have to be stripped before the preference lookup, or a toned vowel
 * misses the table entirely, falls back to spelling itself, and raw IPA leaks
 * into what is supposed to be an orthography — which is how a place name came
 * out as "Khu˩hthə˩ra".
 */
const SUPRASEGMENTAL_MARKS = /[˥-˩ːʰʼʲʷ̰̟̥̬̹̞̃]/gu;

/** Diacritic spellings for modifiers, appended to the base letter. */
const MOD_SPELLING = [
    ['aspirated', 'h'],
    ['glottalised', "'"],
    ['palatalised', 'y'],
    ['labialised', 'w'],
];

/**
 * Build a romanisation scheme for an inventory.
 *
 * Returns { map, spell(word), scheme } where `map` is phoneme-ipa → letters.
 */
export function buildRomanisation(inventory, opts = {}) {
    const map = new Map();
    const claimed = new Set();
    const all = [...inventory.consonants, ...inventory.vowels];

    // Order matters: give the short letters to the segments that will be
    // written most, i.e. the plainest ones first.
    const ordered = [...all].sort((a, b) => complexity(a) - complexity(b));

    for (const ph of ordered) {
        const base = baseIpa(ph);
        const prefs = PREFERENCES[base] || [base];
        let letters = null;
        for (const p of prefs) {
            const withMods = applyMods(p, ph);
            if (!claimed.has(withMods)) { letters = withMods; break; }
        }
        if (!letters) {
            /**
             * Everything preferred is taken. Fall back through orthographic
             * devices real languages actually use — doubling, an h-digraph, a
             * y- or w-glide — before ever reaching for a number.
             *
             * A digit in a spelling is a tone mark in every transcription
             * tradition that uses one (Pinyin, Hmong RPA, Zhuang). Using digits
             * as collision breakers made them ambiguous with tone and produced
             * unreadable output like "e2e2".
             */
            const base = applyMods(prefs[0], ph);
            const devices = [base + base, base + 'h', base + 'y', base + 'w', 'h' + base, base + "'"];
            letters = devices.find((d) => !claimed.has(d));
            if (!letters) {
                let n = 2;
                let candidate = base + String(n);
                while (claimed.has(candidate)) candidate = base + String(++n);
                letters = candidate;
            }
        }
        claimed.add(letters);
        map.set(ph.ipa, letters);
    }

    // Vowel length is written by doubling — the commonest convention, and the
    // one that degrades most gracefully when length is lost.
    for (const ph of inventory.vowels) {
        if (!ph.f.long) continue;
        // Find the short counterpart by identity of FEATURES, not by string
        // surgery on the IPA - a toned long vowel's short partner is not
        // reachable by deleting one character.
        const short = inventory.vowels.find((v) => !v.f.long
            && v.f.height === ph.f.height && v.f.back === ph.f.back
            && v.f.round === ph.f.round && v.f.nasal === ph.f.nasal);
        const base = short && map.get(short.ipa);
        if (base) map.set(ph.ipa, base + base);
    }
    // Nasalised vowels are written with a following n, the convention in
    // French, Portuguese and Polish orthography alike.
    for (const ph of inventory.vowels) {
        if (!ph.f.nasal) continue;
        const oral = inventory.vowels.find((v) => !v.f.nasal
            && v.f.height === ph.f.height && v.f.back === ph.f.back
            && v.f.round === ph.f.round && v.f.long === ph.f.long);
        const base = oral && map.get(oral.ipa);
        if (base && !base.endsWith('n')) map.set(ph.ipa, base + 'n');
    }

    /**
     * A toned vowel is the SAME vowel as its toneless counterpart, wearing a
     * tone. It must share the base spelling and be distinguished only by the
     * tone mark — otherwise /ə/ and /ə˩/ compete for separate letters and come
     * out as "e" and "ë1", which claims a vowel contrast the language does not
     * have. Pinyin writes ma / má / mǎ / mà, not four different vowels.
     */
    for (const ph of inventory.vowels) {
        if (!ph.f.tone) continue;
        const toneless = inventory.vowels.find((v) => !v.f.tone
            && v.f.height === ph.f.height && v.f.back === ph.f.back
            && v.f.round === ph.f.round && v.f.long === ph.f.long && v.f.nasal === ph.f.nasal);
        const base = toneless && map.get(toneless.ipa);
        if (base) map.set(ph.ipa, base);
    }

    /**
     * Spell a word.
     *
     * Tone is written as a trailing digit after the vowel it sits on, which is
     * what Pinyin (ma1 ma2 ma3 ma4), Hmong RPA and Zhuang all do. It is NOT a
     * property of a segment in the same way place or manner is — it belongs to
     * the syllable — so it is appended after the base letters rather than being
     * baked into the phoneme's spelling.
     *
     * Length is written by doubling, nasality by a following n. Both are the
     * commonest conventions and both degrade gracefully when the contrast is
     * later lost.
     */
    const spell = (word) => (word || []).map((ph) => {
        let out = map.get(ph.ipa) ?? fallbackSpell(ph, map);
        if (ph.type === 'V' && ph.f.tone) out += String(ph.f.tone);
        return out;
    }).join('');

    return { map, spell, scheme: opts.name || 'default' };
}

function baseIpa(ph) {
    // Strip every suprasegmental modification to find the base letter. Tone in
    // particular MUST come off here: a Chao letter left on the string makes the
    // lookup miss and the segment spell as raw IPA.
    return ph.ipa.replace(SUPRASEGMENTAL_MARKS, '');
}

function applyMods(letters, ph) {
    let out = letters;
    if (ph.type === 'C') {
        for (const [feat, mark] of MOD_SPELLING) if (ph.f[feat]) out += mark;
    } else if (ph.f.nasal) {
        out += 'n';
    }
    return out;
}

function complexity(ph) {
    let n = ph.ipa.length;
    if (ph.type === 'C') for (const [feat] of MOD_SPELLING) if (ph.f[feat]) n += 2;
    if (ph.f.long) n += 1;
    return n;
}

/**
 * A segment the scheme has never seen — produced by a sound change that created
 * something new. Spell it from its nearest relative rather than dropping it,
 * and mark nothing: an orthography that silently loses segments is worse than
 * one that spells them oddly.
 */
function fallbackSpell(ph, map) {
    const base = baseIpa(ph);
    if (map.has(base)) return applyMods(map.get(base), ph);
    const prefs = PREFERENCES[base];
    if (prefs) return applyMods(prefs[0], ph);
    return ph.ipa;
}

/** Human-readable table for the grammar sketch. */
// ---------------------------------------------------------------------------
// Frozen spelling
// ---------------------------------------------------------------------------

/**
 * How a stage writes one of its words.
 *
 * The distinction this exists to make: what freezes at standardisation is the
 * spelling of each WORD, not the letter-to-sound mapping. English does not
 * write ⟨knight⟩ because ⟨kn⟩ is its way of spelling /n/; it writes ⟨knight⟩
 * because that is how the word was spelled in 1400, when every letter in it was
 * pronounced. The mapping went on being sane; the words stopped being respelled.
 *
 * Freezing the phoneme map instead produced almost no drift at all, which is
 * how the defect showed itself: the same phonemes kept spelling the same way,
 * so a fresh transparent orthography agreed with the frozen one on 99% of the
 * lexicon. Only words containing a segment the language had since lost differed.
 *
 * So a frozen stage carries a table of word spellings inherited from the stage
 * that was written down. Words that arrive later — loans, new derivatives, cells
 * grammaticalised since — are not in it and are spelled by the current mapping,
 * which is also what happens: recent borrowings are spelled more phonetically
 * than the native stratum in every language with a deep orthography.
 */
export function spellEntry(state, entry) {
    if (!entry) return '';
    const frozen = state?.spellings?.get(entry.id);
    if (frozen != null) return frozen;
    return state.romanisation.spell(entry.form);
}

/** Build the table that will be inherited from here down. */
export function freezeSpellings(entries, romanisation) {
    const out = new Map();
    for (const e of entries) out.set(e.id, romanisation.spell(e.form));
    return out;
}

// ---------------------------------------------------------------------------
// Orthographic depth
// ---------------------------------------------------------------------------

function editDistance(a, b) {
    const m = a.length, n = b.length;
    if (!m) return n;
    if (!n) return m;
    let prev = Array.from({ length: n + 1 }, (_, j) => j);
    for (let i = 1; i <= m; i++) {
        const cur = [i];
        for (let j = 1; j <= n; j++) {
            cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
        }
        prev = cur;
    }
    return prev[n];
}

/**
 * How far a language's spelling has drifted from its pronunciation.
 *
 * The single most recognisable sign that a language has a written history, and
 * until now every stage in this engine scored zero on it: spelling was rebuilt
 * from the inventory at every stage, so every language spelled itself perfectly
 * phonemically forever. No literate culture has ever managed that. English
 * fixed its spelling around 1450 and then ran the Great Vowel Shift underneath
 * it, which is why *knight* is /naɪt/ and *eaux* is /o/.
 *
 * Measured as the share of words the frozen orthography now spells differently
 * from how a spelling reform would spell them today, plus how far apart the two
 * are when they differ. Depth is zero at the standardisation year by
 * construction and climbs with every century after it.
 */
export function orthographicDepth(state, { examples = 8 } = {}) {
    if (!state?.romanisation || !state.phonemicRomanisation) return null;
    const live = (state.entries || []).filter((e) => !e.retired && !e.paradigm);
    if (!live.length) return null;

    let mismatched = 0, distance = 0;
    const shown = [];
    for (const e of live) {
        const written = spellEntry(state, e);
        const spoken = state.phonemicRomanisation.spell(e.form);
        if (written === spoken) continue;
        mismatched += 1;
        distance += editDistance(written, spoken) / Math.max(written.length, spoken.length, 1);
        if (shown.length < examples) shown.push({ written, spoken, ipa: e.ipa, gloss: e.gloss });
    }
    return {
        words: live.length,
        mismatched,
        depth: mismatched / live.length,
        meanDistance: mismatched ? distance / mismatched : 0,
        frozenAt: state.orthographyFrozenAt ?? null,
        examples: shown,
    };
}

export function formatRomanisation(rom, inventory) {
    const rows = [];
    for (const ph of [...inventory.consonants, ...inventory.vowels]) {
        const letters = rom.map.get(ph.ipa);
        if (letters && letters !== ph.ipa) rows.push(`${ph.ipa}=${letters}`);
    }
    return rows.join('  ');
}
