/**
 * How a script is invented, and how another language takes it up.
 *
 * ## Invention
 *
 * A people that invents writing draws its own words (pictograms.js): the
 * sign for "water" is a picture of water and stands for the word. Then the
 * rebus: the picture is read for its sound and written for other words that
 * sound alike, so each sign comes to stand for its word's first syllable as
 * well (Sumerian, Egyptian, Chinese all did this). The engine gives each
 * sign both values, the word and the syllable.
 *
 * ## Adoption, by the first sound
 *
 * A borrowing people does not learn the pictures' old words. It names each
 * picture in its own language and reads the sign as that word's first
 * sound: Semitic scribes took the Egyptian ox and called it ʔalp, so the ox
 * meant ʔ; the house, bet, meant b; the water, mem, meant m. That is
 * acrophony, and it is why a sign's value follows the borrower's vocabulary.
 * Signs whose sound the borrower does not have are spare, and a borrower
 * that needs vowel letters puts the spare signs to that use, as Greek
 * turned the Phoenician ʔ, h, ħ and ʕ into A, E, H and O.
 *
 * ## What kind of script
 *
 * The borrower's sounds decide the kind (Daniels and Bright):
 *
 *   abugida     few vowels and open syllables: a sign per consonant with a
 *               vowel built in, and marks for the other vowels (Brahmi and
 *               its descendants, Ethiopic)
 *   abjad       many consonants and few vowels, vowels left unwritten
 *               (Phoenician, Hebrew, Arabic)
 *   alphabet    the rest: a sign for each consonant and each vowel (Greek,
 *               Latin, Cyrillic, Armenian, Georgian)
 *
 * A sound with no sign gets one made from the nearest sign it has, with a
 * mark added (Czech č from c, Old English þ and ð, Cyrillic ж and ш), or
 * two signs together (English sh, th).
 */

import { pictogram, DRAWABLE } from './pictograms.js';
import { glyph, similarity } from './strokes.js';
import { drift, mirror as mirrorGlyph, distinguish } from './evolve.js';
import { syllabify } from '../phonology/phonotactics.js';

const base = (ipa) => ipa.replace(/[˥-˩ːʰʼ̞̃]/gu, '');

/** The first syllable of a word as a CV string, from its phonemes. */
export function firstSyllable(form) {
    const onset = [], vowel = form.find((p) => p.type === 'V');
    for (const p of form) { if (p.type === 'V') break; onset.push(p); }
    return { onset: onset.map((p) => base(p.ipa)), vowel: vowel ? base(vowel.ipa) : null, cv: `${onset.length ? base(onset[onset.length - 1].ipa) : ''}${vowel ? base(vowel.ipa) : ''}` };
}

/** The word a language has for a concept, live and its own. */
const wordFor = (state, concept) => state.entries.find((e) => e.gloss === concept && e.core && !e.retired && !e.paradigm && !e.sameWordAs)
    || state.entries.find((e) => e.gloss === concept && !e.retired && !e.paradigm);

/**
 * Invent a script from a language's own words: a sign for each drawable
 * concept the language has a word for, most signs the pictures (type
 * `pictographic`); the next stage reads them for sound too (`logosyllabic`).
 */
export function inventScript({ id, name, year, state, rng, ductus = 'painted', direction = 'ttb', maxSigns = 96 }) {
    const signs = [];
    for (const concept of DRAWABLE) {
        if (signs.length >= maxSigns) break;
        const w = wordFor(state, concept);
        if (!w) continue;
        const pic = pictogram(concept);
        if (!pic) continue;
        const syl = firstSyllable(w.form);
        signs.push({
            id: `${id}:${concept.replace(/[^a-z]/g, '')}`, concept, word: w.ipa, wordGloss: concept,
            value: { word: concept, syllable: syl.cv, onset: syl.onset[syl.onset.length - 1] || null, vowel: syl.vowel },
            glyph: drift(pic, rng, 0.02), from: null,
        });
    }
    return {
        id, name, year, language: state.langId, type: 'pictographic', direction, ductus, signs,
        parent: null, invented: true,
        changes: [{ year, kind: 'invention', note: `${signs.length} signs drawn as pictures of the words they stand for`, analogue: 'Sumerian, Egyptian and Chinese writing each began as pictures of words: the Sumerian head, mouth, water and grain; the Egyptian owl, hand and reed' }],
    };
}

/**
 * A language takes up a script. `donor` is the script stage it learns from
 * and `state` the language as it stood then; the signs keep their shapes
 * (as the stage before, mirrored if the direction turns) and take the values
 * the borrower's sounds and words give them.
 */
export function adoptScript({ id, name, year, donor, state, rng, ductus = donor.ductus, direction = null, reform = false }) {
    const cons = state.inventory.consonants.map((c) => base(c.ipa)).filter((x, i, a) => a.indexOf(x) === i);
    const vows = state.inventory.vowels.map((v) => base(v.ipa)).filter((x, i, a) => a.indexOf(x) === i);
    const kind = scriptKind(state, cons, vows);
    const turn = direction && direction !== donor.direction && isHorizontal(direction) !== isHorizontal(donor.direction) ? 'rotate'
        : direction && direction !== donor.direction ? 'mirror' : null;
    const prep = (g) => (turn === 'mirror' ? mirrorGlyph(g) : g);

    // 1. each donor sign's value for this borrower: by its own word for the picture, else by the donor's sound
    const candidates = donor.signs.map((s) => {
        const w = s.concept ? wordFor(state, s.concept) : null;
        const syl = w ? firstSyllable(w.form) : null;
        const sound = syl ? (syl.onset.length ? syl.onset[syl.onset.length - 1] : syl.vowel) : nearestSound(s.value?.onset || s.value?.syllable?.[0] || null, cons);
        return { donor: s, word: w?.ipa ?? null, acrophony: !!w, sound, syllable: syl?.cv ?? s.value?.syllable ?? null, vowelInitial: !!syl && !syl.onset.length };
    });

    const signs = [];
    const used = new Set();
    const take = (c, value, origin) => {
        used.add(c.donor.id);
        signs.push({ id: `${id}:${value.sound || value.syllable || value.word}`.replace(/[^\w:]/g, '_'), concept: c.donor.concept ?? null, word: c.word, value, glyph: prep(c.donor.glyph), from: c.donor.id, origin });
    };
    const need = kind === 'abjad' ? cons : [...cons, ...vows];
    // 2. a sign for each sound, the first sign whose first sound it is
    for (const sound of need) {
        const c = candidates.find((x) => !used.has(x.donor.id) && x.sound === sound);
        if (!c) continue;
        take(c, { sound, kind: cons.includes(sound) ? 'C' : 'V', syllable: kind === 'abugida' ? `${sound}${vows[0]}` : null },
            c.acrophony ? `the first sound of ${state.langId}'s own word for ${c.donor.concept}, ${c.word}` : `the donor's sign for ${c.donor.value?.syllable || c.donor.value?.word}`);
    }
    // 3. spare signs: ones whose sound this language lacks go to its vowels (Greek), or are dropped
    const spare = candidates.filter((x) => !used.has(x.donor.id));
    const missingV = kind === 'abjad' ? [] : vows.filter((v) => !signs.some((s) => s.value.sound === v));
    for (const v of missingV) {
        const c = spare.find((x) => !used.has(x.donor.id) && (x.vowelInitial || !cons.includes(x.sound)));
        if (!c) break;
        take(c, { sound: v, kind: 'V' }, `a spare sign (${c.donor.concept ?? c.donor.value?.syllable}, a sound this language lacks) put to a vowel, as Greek did with the Phoenician letters it did not need`);
    }
    // 4. sounds still without a sign: the nearest sign (by place, manner and
    //    voice) with a mark it has not carried before, the nearest sounds first
    const made = [];
    const features = new Map([...state.inventory.consonants, ...state.inventory.vowels].map((p) => [base(p.ipa), p]));
    const taken = new Set();
    const missing = need.filter((sound) => !signs.some((s) => s.value.sound === sound))
        .map((sound) => ({ sound, near: nearestSign(sound, signs, features) }))
        .filter((x) => x.near).sort((a, b) => a.near.d - b.near.d);
    for (const { sound, near } of missing) {
        const options = MARKS.map((m, i) => [m, i]).filter(([, i]) => !taken.has(`${near.sign.id}|${i}`));
        if (!options.length) continue;
        const [mark, mi] = rng.pick(options);
        taken.add(`${near.sign.id}|${mi}`);
        const sign = { id: `${id}:${sound}`.replace(/[^\w:]/g, '_'), concept: null, word: null, value: { sound, kind: cons.includes(sound) ? 'C' : 'V' }, glyph: mark.apply(near.sign.glyph), from: near.sign.id, origin: `${near.sign.value.sound} with ${mark.label}, for a sound the script had no sign for`, made: true };
        signs.push(sign);
        made.push(sign);
    }
    // 5. every sign told from every other
    const distinct = distinguish(signs, rng);
    const changes = [];
    if (reform) changes.push({ year, kind: 'reform', note: `the ${kind} fixed by the state: a sign for each sound, every sign told from every other`, analogue: 'the Qin standardisation of the Chinese script (221 BC); the dots that tell the Arabic letters apart (7th century)' });
    else changes.push({ year, kind: 'adoption', note: `taken up from ${donor.name}: each sign read by the first sound of this language's own word for its picture (${signs.filter((s) => s.origin?.startsWith('the first sound')).length} of ${signs.length})`, analogue: 'Semitic scribes read the Egyptian ox as ʔalp and the house as bet: the first alphabet (c. 1800 BC)' });
    if (turn === 'mirror') changes.push({ year, kind: 'mirror', note: `written ${label(direction)} where ${donor.name} ran ${label(donor.direction)}: the signs turned over`, analogue: 'Greek, written left to right, mirrored the Phoenician letters, written right to left' });
    if (turn === 'rotate') changes.push({ year, kind: 'rotate', note: `written ${label(direction)} where ${donor.name} ran ${label(donor.direction)}: the signs turned a quarter`, analogue: 'cuneiform signs turned a quarter when the tablets did; Mongolian turned the Uyghur letters to run down the page' });
    if (made.length) changes.push({ year, kind: 'new-signs', note: `${made.length} signs made for sounds the script lacked: ${made.map((s) => s.value.sound).join(' ')}`, analogue: 'Old English þ and ð, Czech č and š, Cyrillic ж and ш' });
    const fresh = distinct.filter((s) => s.markedAt === 'now');
    if (fresh.length) changes.push({ year, kind: 'marks', note: `${fresh.length} signs took a dot or bar to be told from another`, analogue: 'the Arabic dots; Hebrew shin and sin' });
    return {
        id, name, year, language: state.langId, type: kind, direction: direction || donor.direction, ductus, signs: distinct.map((s) => ({ ...s, markedAt: undefined })),
        parent: donor.id, invented: false, changes,
        inherent: kind === 'abugida' ? vows[0] : null,
    };
}

/** abugida, abjad or alphabet, from the language's sounds and syllables. */
export function scriptKind(state, cons, vows) {
    const core = state.entries.filter((e) => e.core && !e.retired && !e.paradigm && e.form?.length);
    let open = 0, n = 0;
    for (const e of core.slice(0, 300)) for (const s of syllabify(e.form, state.phonotactics)) { n += 1; if (!s.coda.length) open += 1; }
    const openShare = n ? open / n : 1;
    if (vows.length <= 5 && openShare >= 0.85) return 'abugida';
    if (cons.length >= 20 && vows.length <= 4) return 'abjad';
    return 'alphabet';
}

const isHorizontal = (d) => d === 'ltr' || d === 'rtl' || d === 'boustrophedon';
const label = (d) => ({ ltr: 'left to right', rtl: 'right to left', ttb: 'top to bottom', boustrophedon: 'as the ox ploughs' })[d] || d;

/** The nearest of the borrower's consonants to a sound the donor wrote (by place, manner and voice). */
function nearestSound(ipa, cons) {
    if (!ipa) return null;
    if (cons.includes(ipa)) return ipa;
    let best = null, bd = Infinity;
    for (const c of cons) { const d = soundDist(ipa, c); if (d < bd) { bd = d; best = c; } }
    return best;
}
function nearestSign(sound, signs, features) {
    let best = null, bd = Infinity;
    const a = features.get(sound);
    for (const s of signs) {
        if (!s.value.sound || s.made) continue;
        const b = features.get(s.value.sound);
        const d = a && b ? featureDist(a, b) : soundDist(sound, s.value.sound);
        if (d < bd) { bd = d; best = s; }
    }
    return best ? { sign: best, d: bd } : null;
}
/** The engine's own features: the distance contact.js uses when a borrower hears a foreign sound. */
const PLACES = ['bilabial', 'labiodental', 'dental', 'alveolar', 'postalveolar', 'retroflex', 'alveolopalatal', 'palatal', 'velar', 'labiovelar', 'uvular', 'pharyngeal', 'glottal'];
const MANNERS = ['stop', 'affricate', 'fricative', 'nasal', 'trill', 'tap', 'approximant'];
function featureDist(a, b) {
    if (a.type !== b.type) return 100;
    if (a.type === 'V') return Math.abs(a.f.height - b.f.height) * 1.4 + Math.abs(a.f.back - b.f.back) * 1.2 + (a.f.round === b.f.round ? 0 : 1);
    return Math.abs(PLACES.indexOf(a.f.place) - PLACES.indexOf(b.f.place)) * 0.8 + Math.abs(MANNERS.indexOf(a.f.manner) - MANNERS.indexOf(b.f.manner)) * 1.3
        + (a.f.voice === b.f.voice ? 0 : 1.1) + (a.f.lateral === b.f.lateral ? 0 : 1.5) + (a.f.aspirated === b.f.aspirated ? 0 : 0.5)
        + (a.f.palatalised === b.f.palatalised ? 0 : 0.4) + (a.f.labialised === b.f.labialised ? 0 : 0.4) + (a.f.glottalised === b.f.glottalised ? 0 : 0.6);
}
/** A rough distance between two IPA symbols: by the letters' rows in a small table. */
const ROWS = ['pbmɸβfvʋ', 'tdnszθðɾrlɬɮ', 'ʈɖɳʂʐɭ', 'tʃdʒʃʒɕʑcɟɲçʝj', 'kɡŋxɣwɰ', 'qɢɴχʁ', 'ħʕhɦʔ'];
const VROWS = ['iyɨʉɯu', 'eøɘɵɤo', 'ɛœɜɞʌɔ', 'aɶäɑɒ'];
function soundDist(a, b) {
    if (a === b) return 0;
    const row = (x, rows) => rows.findIndex((r) => [...r].some((ch) => x.includes(ch)));
    const ra = row(a, ROWS), rb = row(b, ROWS);
    if (ra >= 0 && rb >= 0) return Math.abs(ra - rb) + 0.5;
    const va = row(a, VROWS), vb = row(b, VROWS);
    if (va >= 0 && vb >= 0) return Math.abs(va - vb) + 0.5;
    return 6;
}
/**
 * The ways a script makes a new letter from an old one: a dot or bar above
 * or below (Arabic, Hebrew, Czech), a stroke through (Polish ł, Danish ø), a
 * tail or hook (Latin ç, ȩ, the Cyrillic щ), a second stroke beside it
 * (Cyrillic ш from ц, w from v), the letter doubled (Albanian ll, rr), or
 * stretched up or down (Latin j from i, the long s).
 */
const dot = (cx, cy) => ({ pts: [[cx - 0.035, cy], [cx, cy - 0.035], [cx + 0.035, cy], [cx, cy + 0.035]], curve: true, closed: true });
const MARKS = [
    { label: 'a dot above', apply: (g) => glyph([...g.strokes, dot(0.5, 0.05)]) },
    { label: 'a dot below', apply: (g) => glyph([...g.strokes, dot(0.5, 0.95)]) },
    { label: 'a bar above', apply: (g) => glyph([...g.strokes, { pts: [[0.25, 0.04], [0.75, 0.04]] }]) },
    { label: 'a bar below', apply: (g) => glyph([...g.strokes, { pts: [[0.25, 0.96], [0.75, 0.96]] }]) },
    { label: 'a stroke through', apply: (g) => glyph([...g.strokes, { pts: [[0.2, 0.62], [0.8, 0.38]] }]) },
    { label: 'a tail', apply: (g) => glyph([...g.strokes, { pts: [[0.55, 0.9], [0.7, 0.98], [0.82, 0.92]], curve: true }]) },
    { label: 'a hook', apply: (g) => glyph([...g.strokes, { pts: [[0.88, 0.7], [0.96, 0.82], [0.86, 0.95]], curve: true }]) },
    { label: 'a second stroke beside it', apply: (g) => glyph([...g.strokes.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x * 0.8, y]) })), { pts: [[0.92, 0.15], [0.92, 0.85]] }]) },
    { label: 'the sign doubled', apply: (g) => glyph([...g.strokes.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [0.05 + x * 0.5, y]) })), ...g.strokes.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [0.45 + x * 0.5, y]) }))]) },
    { label: 'an ascender', apply: (g) => glyph([...g.strokes.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x, 0.3 + y * 0.7]) })), { pts: [[0.5, 0.02], [0.5, 0.3]] }]) },
    { label: 'a descender', apply: (g) => glyph([...g.strokes.map((s) => ({ ...s, pts: s.pts.map(([x, y]) => [x, y * 0.7]) })), { pts: [[0.5, 0.7], [0.5, 0.98]] }]) },
    { label: 'a ring above', apply: (g) => glyph([...g.strokes, { pts: [[0.44, 0.06], [0.5, 0.0], [0.56, 0.06], [0.5, 0.12]], curve: true, closed: true }]) },
];

export { similarity };
