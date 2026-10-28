/**
 * Writing a word in a script: which signs, in which order, with which marks.
 *
 *   logosyllabic   the word's own sign if it has one, else a sign per
 *                  syllable (the rebus), read by the syllable's consonant
 *                  and vowel (Sumerian, Mycenaean Greek)
 *   abjad          the consonants only (Phoenician, Arabic)
 *   abugida        a sign per consonant with its vowel built in, a mark for
 *                  any other vowel, a bare vowel's own sign at a word's start
 *                  (Devanagari, Ethiopic)
 *   alphabet       a sign per sound (Greek, Latin)
 *
 * A sound the script has no sign for takes the nearest sign it has, as a
 * borrowed word does in any script.
 */

import { firstSyllable } from './adopt.js';
import { syllabify } from '../phonology/phonotactics.js';

const base = (ipa) => ipa.replace(/[˥-˩ːʰʼ̞̃]/gu, '');

/**
 * The signs for a word. `form` is the word's phoneme array; `concept` its
 * gloss, for a word-sign. Returns [{ sign, mark? }] in writing order (the
 * direction is the stage's; the caller lays them out).
 */
export function writeWord(stage, form, concept = null, pt = null) {
    const bySound = new Map(stage.signs.filter((s) => s.value?.sound).map((s) => [s.value.sound, s]));
    const bySyllable = new Map(stage.signs.filter((s) => s.value?.syllable).map((s) => [s.value.syllable, s]));
    const byWord = new Map(stage.signs.filter((s) => s.value?.word).map((s) => [s.value.word, s]));
    const out = [];
    if (stage.type === 'pictographic' || stage.type === 'logosyllabic') {
        if (concept && byWord.has(concept)) return [{ sign: byWord.get(concept), reading: 'word' }];
        if (stage.type === 'pictographic') return [];
        for (const syl of syllabify(form, pt || undefined)) {
            const segs = [...syl.onset, ...syl.nucleus, ...syl.coda];
            const cv = firstSyllable(segs).cv;
            const sign = bySyllable.get(cv) || nearestBy(cv, bySyllable) || null;
            if (sign) out.push({ sign, reading: cv });
        }
        return out;
    }
    const sounds = form.map((p) => ({ ipa: base(p.ipa), vowel: p.type === 'V' }));
    if (stage.type === 'abjad') {
        for (const s of sounds) if (!s.vowel) out.push({ sign: bySound.get(s.ipa) || nearestBy(s.ipa, bySound), reading: s.ipa });
        return out.filter((x) => x.sign);
    }
    if (stage.type === 'abugida') {
        for (let i = 0; i < sounds.length; i++) {
            const s = sounds[i];
            if (s.vowel) {
                // a vowel after a consonant is that consonant's mark (none for the inherent vowel)
                if (i > 0 && !sounds[i - 1].vowel) { if (s.ipa !== stage.inherent) out[out.length - 1].mark = s.ipa; continue; }
                out.push({ sign: bySound.get(s.ipa) || nearestBy(s.ipa, bySound), reading: s.ipa });
            } else {
                const next = sounds[i + 1];
                out.push({ sign: bySound.get(s.ipa) || nearestBy(s.ipa, bySound), reading: s.ipa, bare: !next || !next.vowel || undefined });
            }
        }
        return out.filter((x) => x.sign);
    }
    for (const s of sounds) out.push({ sign: bySound.get(s.ipa) || nearestBy(s.ipa, bySound), reading: s.ipa });
    return out.filter((x) => x.sign);
}

/**
 * The sign whose value is nearest the sound wanted: the same sound with its
 * diacritics off, else the plain letter the sound folds to (an implosive to
 * its stop, a palatal to the velar, a fricative to its nearest), as a
 * borrowed word is spelled with the letters a script has.
 */
const FOLD = { 'ɓ': 'b', 'ɗ': 'd', 'ɠ': 'ɡ', 'ɖ': 'd', 'ʈ': 't', 'ɳ': 'n', 'ɲ': 'n', 'ŋ': 'n', 'ɴ': 'n', 'ʃ': 's', 'ʒ': 'z', 'ɕ': 's', 'ʑ': 'z', 'ʂ': 's', 'ʐ': 'z', 'ɸ': 'f', 'β': 'v', 'θ': 't', 'ð': 'd', 'x': 'k', 'ɣ': 'ɡ', 'χ': 'k', 'ʁ': 'r', 'q': 'k', 'ɢ': 'ɡ', 'ħ': 'h', 'ʕ': 'h', 'ʔ': 'h', 'c': 'k', 'ɟ': 'ɡ', 'ç': 'h', 'ʝ': 'j', 'ɾ': 'r', 'ɬ': 'l', 'ɭ': 'l', 'ʎ': 'l', 'ɥ': 'j', 'ɰ': 'w', 'ʋ': 'v', 'ɹ': 'r', 'g': 'ɡ',
    'ɨ': 'i', 'ʉ': 'u', 'ɯ': 'u', 'y': 'i', 'ø': 'o', 'ɘ': 'e', 'ɵ': 'o', 'ɤ': 'o', 'ə': 'a', 'ɛ': 'e', 'œ': 'o', 'ɜ': 'e', 'ʌ': 'o', 'ɔ': 'o', 'ɑ': 'a', 'ɒ': 'o', 'ä': 'a', 'ɶ': 'a' };
const fold = (s) => [...s.replace(/[ʲʷʰʼ̃ː]/gu, '')].map((ch) => FOLD[ch] || ch).join('');
function nearestBy(key, map) {
    if (!key) return null;
    const plain = key.replace(/[ʲʷʰʼ̃ː]/gu, '');
    if (map.has(plain)) return map.get(plain);
    const folded = fold(key);
    for (const [k, sign] of map) if (fold(k) === folded) return sign;
    let best = null, score = -1;
    for (const [k, sign] of map) {
        let n = 0;
        for (const ch of folded) if (fold(k).includes(ch)) n += 1;
        if (fold(k)[0] === folded[0]) n += 2;
        if (n > score) { score = n; best = sign; }
    }
    return score > 0 ? best : null;
}

/**
 * The SVG for a written word: the signs' paths side by side in the stage's
 * direction, each `size` high, a vowel mark as a small stroke above (ttb:
 * to the right), a bare consonant in an abugida with a short bar below.
 */
export function wordSvg(stage, written, size = 48, gap = 0.1) {
    const vertical = stage.direction === 'ttb';
    const items = stage.direction === 'rtl' ? [...written].reverse() : written;
    const step = size * (1 + gap);
    const parts = [];
    items.forEach((w, i) => {
        const x = vertical ? 0 : i * step, y = vertical ? i * step : 0;
        parts.push(`<g transform="translate(${x},${y}) scale(${size / 100})"><path d="${w.sign.path}"/>${markPath(w, vertical)}</g>`);
    });
    const w = vertical ? size : items.length * step, h = vertical ? items.length * step : size;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${Math.max(1, w)} ${Math.max(1, h)}" width="${Math.max(1, w)}" height="${Math.max(1, h)}" fill="currentColor">${parts.join('')}</svg>`;
}

/** A vowel mark: a small stroke above the sign, different for each vowel (an abugida's); a bar below a bare consonant. */
function markPath(w, vertical) {
    const out = [];
    if (w.mark) {
        const k = [...w.mark].reduce((a, c) => a + c.charCodeAt(0), 0) % 4;
        const shapes = ['M38,4L62,4', 'M42,2L50,10L58,2', 'M44,6L50,2L56,6L50,10Z', 'M40,8L50,2L60,8'];
        out.push(`<path d="${shapes[k]}" stroke="currentColor" stroke-width="5" fill="none" transform="${vertical ? 'translate(96,0) rotate(90)' : ''}"/>`);
    }
    if (w.bare) out.push(`<path d="M40,97L60,97" stroke="currentColor" stroke-width="4" fill="none"/>`);
    return out.join('');
}
