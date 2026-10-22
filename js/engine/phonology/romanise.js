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
    'k͡p': ['kp'], 'ɡ͡b': ['gb'],   // the labial-velars, as Yoruba and Igbo write them
    // implosives: the base letter, and the glottal mark applyMods adds (Hausa writes 'b 'd)
    'ɓ': ['b', 'bb'], 'ɗ': ['d', 'dd'], 'ᶑ': ['dr', 'rd'], 'ʄ': ['j', 'dy'], 'ɠ': ['g', 'gg'], 'ʛ': ['gq', 'g'],
    'p͡ɸ': ['pf'], 'b͡β': ['bv'],
    /**
     * The bilabial fricatives, the dentals, and the back/retroflex stops.
     *
     * All of these were simply absent from the table, so `fallbackSpell` handed
     * back the IPA symbol itself and the "orthography" contained characters no
     * Latin keyboard has: 197 mappings across the corpus spelled a phoneme as
     * raw IPA, /β/ alone in 102 languages, producing words like ⟨aββerli⟩.
     * Greek writes β as ⟨v⟩ and Spanish merges it into ⟨b⟩; Indic romanisation
     * writes the retroflexes with an ⟨r⟩ digraph, which is the convention the
     * rest of this table already uses for /ɳ ɭ ɽ/.
     */
    'β': ['v', 'bh', 'bv'], 'ɸ': ['f', 'ph', 'fh'],
    't̪': ['t', 'tt', 'th'], 'd̪': ['d', 'dd'], 'n̪': ['n', 'nn', 'nh'],
    'ʈ': ['tr', 'rt'], 'ɖ': ['dr', 'rd'], 'ɢ': ['gq', 'gg'],
    'f': ['f'], 'v': ['v'], 'θ': ['th'], 'ð': ['dh'],
    's': ['s'], 'z': ['z'], 'ʃ': ['sh'], 'ʒ': ['zh'],
    'ʂ': ['sh', 'sr'], 'ʐ': ['zh', 'zr'], 'ɕ': ['x', 'sy'], 'ʑ': ['j', 'zy'],
    'ç': ['hy'], 'ʝ': ['yh'], 'x': ['kh'], 'ɣ': ['gh'],
    // the palatal stops as Hungarian writes them (and Latvian ķ ģ after)
    'c': ['ty', 'ky', 'ķ'], 'ɟ': ['gy', 'dy', 'ģ'],
    'χ': ['kh'], 'ʁ': ['gh'], 'ħ': ['ḥ', 'hh'], 'ʕ': ['`'], 'h': ['h'], 'ɦ': ['h'],
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
    /**
     * Then a single marked letter before any digraph: Turkish ⟨ı⟩, Albanian
     * ⟨ë⟩, Romanian ⟨ă⟩, Vietnamese ⟨ơ ư⟩, Lithuanian ⟨ė ę⟩, Old Norse ⟨ǫ⟩,
     * Scandinavian ⟨å⟩. Digraphs made of ordinary letters run into the letters
     * around them: /ɜ/ as ⟨er⟩ beside a real r gave ⟨rryerr⟩, /ɘ/ as ⟨eh⟩
     * beside a real h gave ⟨ehh⟩, and a long one doubled to ⟨oooo⟩. Grave,
     * acute, macron and circumflex stay free for tone.
     */
    'ɨ': ['y', 'ı', 'ii', 'yh'], 'ʉ': ['ü', 'uu', 'uy'], 'ɯ': ['ı', 'ư', 'w', 'eu'], 'y': ['ü', 'yu', 'iu'],
    'ø': ['ö', 'oe', 'eo'], 'ɵ': ['ö', 'ơ', 'oe', 'ue'], 'ɘ': ['ë', 'ă', 'eh', 'ee'], 'ɤ': ['ơ', 'ë', 'eu', 'uh'],
    'ə': ['e', 'ë', 'ă', 'a'], 'ɛ': ['e', 'ę', 'ê', 'ae'], 'œ': ['ö', 'œ', 'oe', 'eu'], 'ɜ': ['ë', 'ă', 'ea'],
    'ʌ': ['u', 'ŭ', 'â', 'uh'], 'ɔ': ['o', 'ǫ', 'ô', 'aw'], 'ɑ': ['a', 'â', 'ar'],
    'ɒ': ['o', 'ǫ', 'au'], 'ä': ['a', 'aa'], 'ɶ': ['ae', 'oe'],
    // The mid row. Without these, a vowel lowered or raised by a chain shift
    // missed the table and spelled itself as raw IPA inside a name.
    'e̞': ['e', 'ė', 'eh', 'ea'], 'o̞': ['o', 'å', 'oh', 'oa'],
    'ø̞': ['ö', 'oe', 'eo'], 'ɤ̞': ['ơ', 'eu', 'uh'], 'ɵ̞': ['ö', 'ue', 'oe'],
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

/** The marked letters of Polish, Czech and Slovak for soft consonants. */
const SOFT_LETTER = { n: 'ń', s: 'ś', z: 'ź', c: 'ć', r: 'ŕ', l: 'ĺ', t: 'ť', d: 'ď' };

/** Diacritic spellings for modifiers, appended to the base letter. */
const MOD_SPELLING = [
    ['aspirated', 'h'],
    ['glottalised', "'"],
    ['palatalised', 'y'],
    ['labialised', 'w'],
];

/**
 * Nasality is a TILDE, not a following ⟨n⟩.
 *
 * The ⟨n⟩ convention is real — French, Portuguese and Polish all use it — but it
 * is ambiguous the moment a nasal vowel is followed by an actual nasal
 * consonant, and this engine produces that constantly. /rẽnə˩na/ came out as
 * ⟨reinne1na⟩: the ⟨n⟩ of nasality ran straight into the ⟨n⟩ of /n/ and the
 * reader sees a geminate that is not there. Portuguese avoids it by using the
 * tilde for exactly this job — ⟨irmã⟩, not ⟨irman⟩ — and so does this.
 */
const COMBINING_TILDE = '̃';
const MACRON = '̄';

/**
 * Tone is a DIACRITIC, not a trailing digit.
 *
 * Digits are a transcription convention (Pinyin's ma1, Hmong RPA, Zhuang), not
 * an orthographic one, and they are for teaching material and dictionaries. Left
 * inside running words they produce ⟨thutsuqzho1⟩ and ⟨ulthë1ghyinmerl⟩, which
 * no reader can take in at a glance and which no language writes.
 *
 * The marks are the standard level-tone ladder used across West African
 * orthographies — Yoruba, Igbo, Hausa — where grave is low, unmarked is mid and
 * acute is high. Assigned by position within the tones the language ACTUALLY
 * has, so a two-register system gets one mark and the unmarked member, rather
 * than an arbitrary Chao number carried over from the phonology.
 */
const TONE_MARKS_ORTHO = ['̀', '̄', '́', '̂']; // grave, macron, acute, circumflex

/** Where a combining mark goes: on the first letter of the vowel's spelling. */
function withMark(letters, mark) {
    if (!mark || !letters) return letters;
    return letters[0] + mark + letters.slice(1);
}

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
    // written most, i.e. the plainest ones first, and among those a sound
    // whose own symbol IS the letter before one that would merely borrow it:
    // /e/ takes ⟨e⟩ before /ə/ does, or /e/ is left spelled ⟨ei⟩ (Ealdorii
    // "water" /ɕese/ was ⟨xeisei⟩).
    // The tap before the trill, as Spanish, Basque and Catalan write them: ⟨r⟩
    // for the tap and ⟨rr⟩ for the trill, not ⟨rr⟩ for the tap.
    const own = (ph) => (ph.ipa === 'ɾ' ? -1 : (PREFERENCES[baseIpa(ph)] || [])[0] === ph.ipa ? 0 : 1);
    const ordered = [...all].sort((a, b) => complexity(a) - complexity(b) || own(a) - own(b));

    for (const ph of ordered) {
        const base = baseIpa(ph);
        const prefs = PREFERENCES[base] || [base];
        let letters = null;
        for (const p of prefs) {
            const withMods = applyMods(p, ph);
            if (!claimed.has(withMods)) { letters = withMods; break; }
        }
        if (!letters && ph.type === 'C' && ph.f.palatalised) {
            /**
             * A soft consonant beside a palatal that took its ⟨Cy⟩: the
             * Croatian ⟨nj lj⟩, then the Polish and Czech marked letters
             * (ń ś ź ć ŕ ĺ ť ď), then an apostrophe, as Russian is
             * transliterated. The general devices below wrote ⟨nyh⟩.
             */
            const plain = applyMods(prefs[0], { ...ph, f: { ...ph.f, palatalised: false } });
            letters = [plain + 'j', SOFT_LETTER[plain], plain + "'"].find((d) => d && !claimed.has(d)) || null;
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
            /**
             * Doubling only ever applies to a SINGLE letter. Doubling a digraph
             * produces ⟨khkh⟩, which reads as two segments and is not a device
             * any orthography uses — /kʰ/ in Marame was spelled ⟨khkho⟩ because
             * ⟨kh⟩ was already claimed by /x/.
             */
            const devices = base.length === 1
                ? [base + base, base + 'h', base + 'y', base + 'w', 'h' + base, base + "'"]
                : [base + 'h', base + 'y', base + 'w', 'h' + base, base + "'"];
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
    // one that degrades most gracefully when length is lost. (A macron is a
    // tone mark in a language with tones, so there a digraph doubles too.)
    const tonal = inventory.vowels.some((v) => v.f.tone);
    for (const ph of inventory.vowels) {
        if (!ph.f.long) continue;
        // Find the short counterpart by identity of FEATURES, not by string
        // surgery on the IPA - a toned long vowel's short partner is not
        // reachable by deleting one character.
        const short = inventory.vowels.find((v) => !v.f.long
            && v.f.height === ph.f.height && v.f.back === ph.f.back
            && v.f.round === ph.f.round && v.f.nasal === ph.f.nasal);
        const base = short && map.get(short.ipa);
        // a digraph takes a macron over its first letter, as Latvian and Maori
        // write length: doubled, ⟨ii⟩ for /ɨ/ came out ⟨iiii⟩ for /ɨː/
        if (base) map.set(ph.ipa, base.length === 1 || tonal ? base + base : withMark(base, MACRON));
    }
    // Nasalised vowels take a tilde over the oral vowel's own spelling — see
    // COMBINING_TILDE for why not a following ⟨n⟩.
    for (const ph of inventory.vowels) {
        if (!ph.f.nasal) continue;
        const oral = inventory.vowels.find((v) => !v.f.nasal
            && v.f.height === ph.f.height && v.f.back === ph.f.back
            && v.f.round === ph.f.round && v.f.long === ph.f.long);
        const base = oral && map.get(oral.ipa);
        if (base) map.set(ph.ipa, withMark(base, COMBINING_TILDE));
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
     * The tone ladder for THIS language.
     *
     * Built from the tones the inventory actually contains, lowest Chao value
     * first, so a two-register system spends one mark and leaves the other
     * member unmarked. Beyond four contrasting tones the marks run out and a
     * digit is the honest fallback — but nothing this engine generates gets
     * near that.
     */
    const tonesPresent = [...new Set(inventory.vowels.map((v) => v.f.tone).filter(Boolean))].sort((a, b) => a - b);
    const toneMark = new Map();
    tonesPresent.forEach((t, i) => toneMark.set(t, TONE_MARKS_ORTHO[i] ?? String(t)));

    /**
     * Spell a word.
     *
     * Length is written by doubling, nasality with a tilde, tone with the
     * language's own diacritic. All three are orthographic conventions rather
     * than transcription ones, and all three degrade gracefully when the
     * contrast is later lost.
     */
    const spell = (word) => (word || []).map((ph) => {
        const out = map.get(ph.ipa) ?? fallbackSpell(ph, map);
        if (ph.type === 'V' && ph.f.tone) {
            /**
             * A tone the spelling's inventory never had. A frozen orthography is
             * built from the stage that was written down, and tones that arose
             * after it (now that tonogenesis comes in layers) are not on its
             * ladder; looking them up wrote the word "undefined" into the
             * middle of place names. They take the level-tone mark for their
             * Chao height instead: grave for low, acute for high.
             */
            const mark = toneMark.get(ph.f.tone)
                ?? (ph.f.tone <= 2 ? TONE_MARKS_ORTHO[0] : ph.f.tone >= 4 ? TONE_MARKS_ORTHO[2] : TONE_MARKS_ORTHO[1]);
            // A one-character fallback that isn't a combining mark is a digit;
            // append it rather than trying to place it over a letter.
            return mark && mark.charCodeAt(0) >= 0x300 && mark.charCodeAt(0) <= 0x36f
                ? withMark(out, mark)
                : out + mark;
        }
        return out;
    }).join('');

    return { map, spell, toneMark, scheme: opts.name || 'default' };
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
        out = withMark(out, COMBINING_TILDE);
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
