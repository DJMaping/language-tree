/**
 * Hieroglyphs: Egypt's road (DJ, 29 Oct 2026, for Areoix Lie's own script:
 * "the wiki calls it Areoix Lie's Old Kingdom").
 *
 * The Egyptian signs stayed pictures, standing free in rows, and were read
 * three ways at once: a picture as its own word (a logogram, marked with a
 * stroke beneath it); a picture for the first consonant of its word (the
 * uniliteral signs, an alphabet of consonants hidden inside the script); and
 * a picture set at the end of a word, unspoken, to say what kind of thing
 * the word is (the determinative: a man, a god, a town, a plant, water).
 * Vowels were not written. Beside the carved pictures the scribes wrote a
 * fast hand on papyrus (hieratic), and later a faster one (demotic), in
 * which the pictures can no longer be seen; here no conquest ended the
 * script, so the fast hand is what print set.
 *
 * `hieroScript` takes a stage of pictures (adopt.js inventScript) and reads
 * it this way for a language; the stages after it evolve the shapes (the
 * cursivise and simplify of evolve.js), the readings kept.
 */

import { RADICAL, wordOf } from './logo.js';
import { glyph } from './strokes.js';

const base = (ipa) => ipa.replace(/[˥-˩ːʰʼ̞̃ʲʷ]/gu, '');

export function hieroScript({ id, name, year, donor, state, rng, ductus = 'relief', direction = 'rtl' }) {
    const signs = donor.signs.map((s) => {
        const w = wordOf(state, s.concept);
        const form = w?.form || [];
        const firstC = form.find((p) => p.type !== 'V');
        const sound = firstC ? base(firstC.ipa) : null;
        return {
            ...s, id: `${id}:${s.id.split(':').slice(1).join(':')}`, from: s.id, word: w?.ipa ?? s.word,
            value: { word: s.concept, sound },
            origin: `a picture of ${s.concept}${sound ? `, read ${sound} by the first consonant of ${w?.ipa ?? s.word}` : ''}`,
        };
    });
    // the consonant signs: for each consonant the language has, the simplest picture whose word begins with it
    const consonantSigns = {};
    const cons = state.inventory.consonants.map((c) => base(c.ipa)).filter((x, i, a) => a.indexOf(x) === i);
    for (const c of cons) {
        const cands = signs.filter((s) => s.value.sound === c).sort((a, b) => a.glyph.strokes.length - b.glyph.strokes.length);
        if (cands[0]) consonantSigns[c] = cands[0].id;
    }
    // the determinatives: the picture of each kind of thing (the radicals of logo.js: a hand for doing, a heart for feeling, water, a house)
    const determinatives = {};
    for (const [domain, concept] of Object.entries(RADICAL)) { const s = signs.find((x) => x.concept === concept); if (s) determinatives[domain] = s.id; }
    // the stroke beneath a picture read as its own word
    const logoMark = { id: `${id}:stroke`, concept: null, word: null, value: { mark: 'word' }, glyph: glyph([{ pts: [[0.5, 0.25], [0.5, 0.8]] }]), from: null, origin: 'the stroke beneath a picture read as its own word' };
    signs.push(logoMark);
    return {
        id, name, year, language: state.langId, type: 'hieroglyphic', direction, ductus, signs, consonantSigns, determinatives, logoMark: logoMark.id,
        parent: donor.id, invented: false,
        changes: [{ year, kind: 'writing', note: `every picture read as its own word, ${Object.keys(consonantSigns).length} of them for the first consonant of their word as well, and ${Object.keys(determinatives).length} set unspoken at a word's end to say what kind of thing it is; the vowels unwritten`, analogue: 'the Egyptian hieroglyphs: logograms with their stroke, the uniliteral signs, the determinatives' }],
    };
}

/** The readings carried to the next stage, whose signs have new ids. */
export function carryReadings(stage, parent) {
    if (!parent.consonantSigns) return stage;
    const re = (sid) => `${stage.id}:${sid.split(':').slice(1).join(':')}`;
    stage.consonantSigns = Object.fromEntries(Object.entries(parent.consonantSigns).map(([c, sid]) => [c, re(sid)]));
    stage.determinatives = Object.fromEntries(Object.entries(parent.determinatives || {}).map(([d, sid]) => [d, re(sid)]));
    if (parent.logoMark) stage.logoMark = re(parent.logoMark);
    return stage;
}
