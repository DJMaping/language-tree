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
    // vowels
    'i': ['i'], 'e': ['e'], 'a': ['a'], 'o': ['o'], 'u': ['u'],
    'ɨ': ['y', 'ii'], 'ʉ': ['uu'], 'ɯ': ['w', 'uh'], 'y': ['ü', 'y'],
    'ø': ['ö'], 'ɵ': ['oe'], 'ɘ': ['eh'], 'ɤ': ['e', 'eu'], 'ə': ['e', 'ë'],
    'ɛ': ['e', 'ê'], 'œ': ['oe'], 'ɜ': ['er'], 'ʌ': ['u', 'â'], 'ɔ': ['o', 'ô'],
    'ɑ': ['a', 'â'], 'ɒ': ['o'], 'ä': ['a'], 'ɶ': ['ae'],
};

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
            // Everything preferred is taken — fall back to the first preference
            // plus a disambiguating mark rather than colliding silently.
            let candidate = applyMods(prefs[0], ph);
            let n = 2;
            while (claimed.has(candidate)) candidate = applyMods(prefs[0], ph) + String(n++);
            letters = candidate;
        }
        claimed.add(letters);
        map.set(ph.ipa, letters);
    }

    // Vowel length is written by doubling — the commonest convention, and the
    // one that degrades most gracefully when length is lost.
    for (const ph of inventory.vowels) {
        if (ph.f.long) {
            const short = map.get(ph.ipa.replace('ː', ''));
            if (short) map.set(ph.ipa, short + short);
        }
    }

    const spell = (word) => (word || []).map((ph) => map.get(ph.ipa) ?? fallbackSpell(ph, map)).join('');

    return { map, spell, scheme: opts.name || 'default' };
}

function baseIpa(ph) {
    // Strip modifier diacritics to find the base letter to build on.
    return ph.ipa.replace(/[ʰʼʲʷːũ̃]/gu, '');
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
export function formatRomanisation(rom, inventory) {
    const rows = [];
    for (const ph of [...inventory.consonants, ...inventory.vowels]) {
        const letters = rom.map.get(ph.ipa);
        if (letters && letters !== ph.ipa) rows.push(`${ph.ipa}=${letters}`);
    }
    return rows.join('  ');
}
