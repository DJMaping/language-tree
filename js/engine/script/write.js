/**
 * Writing a word in a script: which signs, in which order, with which marks.
 *
 *   hieroglyphic   the word's own picture with a stroke, else the consonant
 *                  signs and a picture of its kind at the end (Egyptian)
 *   logographic    the word's own sign, or the sign it borrows; else signs
 *                  read for their sound, a syllable each (Chinese)
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
 * borrowed word does in any script. Signs are set at their own widths, with
 * the script's own space between words (none, a dot, or a space).
 */

import { firstSyllable } from './adopt.js';
import { syllabify } from '../phonology/phonotactics.js';
import { parseWord } from '../features.js';

const base = (ipa) => ipa.replace(/[˥-˩ːʰʼ̞̃]/gu, '');
const SOUND_SIGNS = new WeakMap();

/**
 * The signs for a word. `form` is the word's phoneme array; `concept` its
 * gloss, for a word-sign. Returns [{ sign, mark?, bare?, reading }] in writing
 * order (the direction is the stage's; the caller lays them out). `capital`
 * sets the first sign in its capital form where the script has two cases.
 */
export function writeWord(stage, form, concept = null, pt = null, { capital = false, domain = null } = {}) {
    const bySound = new Map(stage.signs.filter((s) => s.value?.sound).map((s) => [s.value.sound, s]));
    const bySyllable = new Map(stage.signs.filter((s) => s.value?.syllable).map((s) => [s.value.syllable, s]));
    const byWord = new Map(stage.signs.filter((s) => s.value?.word).map((s) => [s.value.word, s]));
    let out = [];
    if (stage.type === 'hieroglyphic') {
        // a word with its own picture is written with it and the stroke; any other by the consonant signs, the
        // vowels unwritten, with the picture of its kind at the end (Egyptian: logogram, uniliterals, determinative)
        const byId = new Map(stage.signs.map((s) => [s.id, s]));
        const mark = byId.get(stage.logoMark);
        const own = concept && stage.signs.find((s) => s.value?.word === concept);
        if (own) return [{ sign: own, reading: 'word' }, ...(mark ? [{ sign: mark, reading: 'stroke' }] : [])];
        const cons = new Map(Object.entries(stage.consonantSigns || {}).map(([c, id]) => [c, byId.get(id)]).filter(([, s]) => s));
        for (const p of form) {
            if (p.type === 'V') continue;
            const c = base(p.ipa);
            const sign = cons.get(c) || nearestBy(c, cons);
            if (sign) out.push({ sign, reading: c });
        }
        const det = domain && stage.determinatives?.[domain] ? byId.get(stage.determinatives[domain]) : null;
        if (det) out.push({ sign: det, reading: 'determinative' });
        // a word of vowels alone, or of sounds no picture begins with: the scribe writes the nearest consonant sign he has
        if (!out.length) { const first = form.find((p) => p.type !== 'V'); const any = cons.values().next().value; if (any) out.push({ sign: any, reading: first ? base(first.ipa) : 'vowel' }); }
        return out;
    }
    if (stage.type === 'logographic') {
        // a word-sign script writes the word's own sign, or the sign it borrows (其 for "his"); a word with neither is
        // spelled with signs read for their sound, one a syllable, as Chinese writes foreign names (華盛頓 for Washington)
        const signOf = (g) => stage.signs.find((s) => s.value?.word === g) || stage.signs.find((s) => (s.loans || []).includes(g));
        const own = concept && signOf(concept);
        if (own) return [{ sign: own, reading: 'word' }];
        // a derived word: its root's sign and its affix's (作者 "one who writes")
        const parts = concept && stage.derived?.[concept];
        if (parts) { const w = parts.map(signOf); if (w.every(Boolean)) return w.map((sign) => ({ sign, reading: 'word' })); }
        if (!SOUND_SIGNS.has(stage)) {
            const m = new Map();
            for (const s of stage.signs) {
                if (!s.value?.reading || s.value.archaic) continue;
                let f; try { f = firstSyllable(parseWord(s.value.reading)).cv; } catch { continue; }
                if (!m.has(f)) m.set(f, s);
            }
            SOUND_SIGNS.set(stage, m);
        }
        const bySyl = SOUND_SIGNS.get(stage);
        for (const syl of syllabify(form, pt || undefined)) {
            const cv = firstSyllable([...syl.onset, ...syl.nucleus, ...syl.coda]).cv;
            const sign = bySyl.get(cv) || nearestBy(cv, bySyl);
            if (sign) out.push({ sign, reading: cv });
        }
        return out;
    }
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
    } else if (stage.type === 'abugida') {
        for (let i = 0; i < sounds.length; i++) {
            const s = sounds[i];
            if (s.vowel) {
                // a vowel after a consonant is that consonant's mark (none for the inherent vowel)
                if (i > 0 && !sounds[i - 1].vowel && out.length) { if (s.ipa !== stage.inherent) out[out.length - 1].mark = s.ipa; continue; }
                out.push({ sign: bySound.get(s.ipa) || nearestBy(s.ipa, bySound), reading: s.ipa });
            } else {
                const next = sounds[i + 1];
                out.push({ sign: bySound.get(s.ipa) || nearestBy(s.ipa, bySound), reading: s.ipa, bare: !next || !next.vowel || undefined });
            }
        }
    } else {
        for (const s of sounds) out.push({ sign: bySound.get(s.ipa) || nearestBy(s.ipa, bySound), reading: s.ipa });
    }
    out = out.filter((x) => x.sign);
    if (capital && out.length && out[0].sign.upperPath) out[0] = { ...out[0], capital: true };
    return out;
}

/**
 * The sign whose value is nearest the sound wanted: the same sound with its
 * diacritics off, else the plain letter the sound folds to (an implosive to
 * its stop, a palatal to the velar, a fricative to its nearest), as a
 * borrowed word is spelled with the letters a script has.
 */
const FOLD = { 'ɓ': 'b', 'ɗ': 'd', 'ɠ': 'ɡ', 'ɖ': 'd', 'ʈ': 't', 'ɳ': 'n', 'ɲ': 'n', 'ŋ': 'n', 'ɴ': 'n', 'ʃ': 's', 'ʒ': 'z', 'ɕ': 's', 'ʑ': 'z', 'ʂ': 's', 'ʐ': 'z', 'ɸ': 'f', 'β': 'v', 'θ': 't', 'ð': 'd', 'x': 'k', 'ɣ': 'ɡ', 'χ': 'k', 'ʁ': 'r', 'q': 'k', 'ɢ': 'ɡ', 'ħ': 'h', 'ʕ': 'h', 'ʔ': 'h', 'c': 'k', 'ɟ': 'ɡ', 'ç': 'h', 'ʝ': 'j', 'ɾ': 'r', 'ɬ': 'l', 'ɭ': 'l', 'ʎ': 'l', 'ɥ': 'j', 'ɰ': 'w', 'ʋ': 'v', 'ɹ': 'r', 'g': 'ɡ', 'f': 'p', 'v': 'b', 'z': 's', 'b': 'p', 'd': 't', 'ɡ': 'k',
    'ɨ': 'i', 'ʉ': 'u', 'ɯ': 'u', 'y': 'i', 'ø': 'o', 'ɘ': 'e', 'ɵ': 'o', 'ɤ': 'o', 'ə': 'a', 'ɛ': 'e', 'œ': 'o', 'ɜ': 'e', 'ʌ': 'o', 'ɔ': 'o', 'ɑ': 'a', 'ɒ': 'o', 'ä': 'a', 'ɶ': 'a', 'e': 'i', 'o': 'u' };
const fold = (s, depth = 1) => { let out = s.replace(/[ʲʷʰʼ̃ː]/gu, ''); for (let d = 0; d < depth; d++) out = [...out].map((ch) => FOLD[ch] || ch).join(''); return out; };
function nearestBy(key, map) {
    if (!key) return null;
    const plain = key.replace(/[ʲʷʰʼ̃ː]/gu, '');
    if (map.has(plain)) return map.get(plain);
    for (const depth of [1, 2, 3]) {
        const folded = fold(key, depth);
        for (const [k, sign] of map) if (fold(k, depth) === folded) return sign;
    }
    let best = null, score = -1;
    const folded = fold(key, 2);
    for (const [k, sign] of map) {
        let n = 0;
        for (const ch of folded) if (fold(k, 2).includes(ch)) n += 1;
        if (fold(k, 2)[0] === folded[0]) n += 2;
        if (n > score) { score = n; best = sign; }
    }
    return score > 0 ? best : null;
}

/**
 * The SVG for a written word or phrase: the signs set side by side in the
 * stage's direction at their own widths, each `size` high; a vowel mark in
 * its place (above, below, after or before); a bare consonant in an abugida
 * with a short bar below; the script's own space between words. `written`
 * is one word's signs, or an array of words.
 */
export function wordSvg(stage, written, size = 48, gap = 0.08) {
    const words = Array.isArray(written[0]) ? written : [written];
    const vertical = stage.direction === 'ttb';
    const rtl = stage.direction === 'rtl';
    const k = size / 100;
    const items = [];
    let pen = 0;
    const sep = stage.separator || 'none';
    words.forEach((word, wi) => {
        if (wi) {
            if (sep === 'space') pen += size * 0.45;
            else if (sep === 'dot') { items.push({ dot: true, at: pen + size * 0.12 }); pen += size * 0.3; }
            else pen += size * gap;
        }
        for (const w of word) {
            const box = (w.capital && w.sign.upperBox) || w.sign.box || { x0: 0.12, x1: 0.88, y0: 0.12, y1: 0.88 };
            const lead = vertical ? box.y0 : box.x0, extent = vertical ? box.y1 - box.y0 : box.x1 - box.x0;
            const before = w.mark && stage.marks?.[w.mark]?.at === 'before' && !vertical ? size * 0.22 : 0;
            const after = w.mark && stage.marks?.[w.mark]?.at === 'after' && !vertical ? size * 0.22 : 0;
            pen += before;
            items.push({ w, word: wi, at: pen - lead * size, path: w.capital && w.sign.upperPath ? w.sign.upperPath : w.sign.path });
            pen += extent * size + after + size * (stage.joining && !vertical ? -0.02 : gap);
        }
    });
    const total = Math.max(1, pen - size * gap + size * 0.1);
    // a script hung from a headline runs one line over the whole word (Devanagari's shirorekha)
    const headlines = [];
    if (stage.style?.headline && !vertical) {
        let x0 = null, x1 = null;
        const flush = () => { if (x0 != null) headlines.push(`<rect x="${(rtl ? total - x1 : x0).toFixed(1)}" y="${(size * 0.1).toFixed(1)}" width="${(x1 - x0).toFixed(1)}" height="${(size * 0.045).toFixed(1)}"/>`); x0 = x1 = null; };
        for (const it of items) {
            if (it.dot) { flush(); continue; }
            const box = (it.w.capital && it.w.sign.upperBox) || it.w.sign.box || { x0: 0.12, x1: 0.88 };
            const a = it.at + box.x0 * size - size * 0.04, b = it.at + box.x1 * size + size * 0.04;
            if (x0 != null && a - x1 > size * 0.3) flush();
            if (x0 == null) x0 = a;
            x1 = b;
        }
        flush();
    }
    // a joined script runs one stroke along the line under each word, its letters touching (Arabic, Syriac)
    if (stage.joining && !vertical) {
        const spans = new Map();
        for (const it of items) {
            if (it.dot || !it.w) continue;
            const box = it.w.sign.box || { x0: 0.12, x1: 0.88 };
            const a = it.at + box.x0 * size, b = it.at + box.x1 * size;
            const sp = spans.get(it.word) || [a, b];
            spans.set(it.word, [Math.min(sp[0], a), Math.max(sp[1], b)]);
        }
        for (const [, [a, b]] of spans) headlines.push(`<rect x="${(rtl ? total - b : a).toFixed(1)}" y="${(size * 0.66).toFixed(1)}" width="${(b - a).toFixed(1)}" height="${(size * 0.045).toFixed(1)}"/>`);
    }
    const parts = items.map((it) => {
        if (it.dot) return `<circle cx="${vertical ? size / 2 : it.at}" cy="${vertical ? it.at : size * 0.5}" r="${size * 0.05}"/>`;
        const pos = rtl ? total - it.at - (it.w.sign.box ? (it.w.sign.box.x1 + it.w.sign.box.x0) * size : size) : it.at;
        const x = vertical ? 0 : pos, y = vertical ? it.at : 0;
        return `<g transform="translate(${x.toFixed(1)},${y.toFixed(1)}) scale(${k})"><path d="${it.path}"/>${markPath(stage, it.w, vertical)}</g>`;
    });
    const w = vertical ? size : total, h = vertical ? total : size;
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${w.toFixed(0)} ${h.toFixed(0)}" width="${w.toFixed(0)}" height="${h.toFixed(0)}" fill="currentColor">${parts.join('')}${headlines.join('')}</svg>`;
}

/** The vowel mark in its place (the stage's own, else a small stroke above); a bar below a bare consonant. */
function markPath(stage, w, vertical) {
    const out = [];
    if (w.mark) {
        const m = stage.marks?.[w.mark];
        if (m?.path) out.push(`<path d="${m.path}" transform="${vertical ? 'translate(100,0) rotate(90)' : ''}"/>`);
        else {
            const idx = [...w.mark].reduce((a, c) => a + c.charCodeAt(0), 0) % 4;
            const shapes = ['M38,4L62,4', 'M42,2L50,10L58,2', 'M44,6L50,2L56,6L50,10Z', 'M40,8L50,2L60,8'];
            out.push(`<path d="${shapes[idx]}" stroke="currentColor" stroke-width="5" fill="none" transform="${vertical ? 'translate(96,0) rotate(90)' : ''}"/>`);
        }
    }
    if (w.bare) out.push(`<path d="M40,97L60,97" stroke="currentColor" stroke-width="4" fill="none"/>`);
    return out.join('');
}
