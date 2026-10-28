/**
 * The writing systems, as a tree over time (docs/writing-systems-plan.md,
 * step 3: the Alzurian line end to end, for DJ to judge).
 *
 *   node scripts/build-scripts.js          -> data/scripts.json
 *
 * Each stage is the stage before it under a few dated changes to its shapes
 * (js/engine/script/evolve.js) or a new people taking it up by the first
 * sounds of its own words (adopt.js), the way Earth's scripts went:
 * pictures, then a knife on bone, then a pen that joins and turns them, then
 * a state's reform; and off that line, the peoples that borrowed it and read
 * it their own way. The languages' words and sounds at each year come from
 * the engine, so the values of the signs follow the languages.
 *
 * The line and its dates are placeholders from the wiki's canon (Alzurian
 * proto-writing after Harappa's 3200 BFA, "evolving into the Alzurian bone
 * script"; Alzuria the home of cursive script; the Dehlan standardisation
 * of Dahen in 207 BFA for the shape of a reform) and from the chart, and
 * are DJ's to change (LINE below).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stateInWorld } from './world.js';
import { derive } from '../js/engine/rng.js';
import { inventScript, adoptScript } from '../js/engine/script/adopt.js';
import { drift, simplify, straighten, cursivise, rotate, mirror, standardise, distinguish, typeset, houseStyle, applyStyle } from '../js/engine/script/evolve.js';
import { toPath, DUCTUS, inkBox, glyph as mkGlyph } from '../js/engine/script/strokes.js';
import { firstSyllable } from '../js/engine/script/adopt.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const byId = new Map(doc.languages.map((l) => [l.id, l]));
const SEED = 'scripts/0001';

/**
 * The Alzurian line. `op`: invent | evolve | reform | adopt. `steps` for an
 * evolve stage are applied to every sign in order. Years are placeholders.
 */
const LINE = [
    { id: 'alz-proto', name: 'Alzurian proto-writing', year: -2800, lang: 'azatin', op: 'invent', ductus: 'painted', direction: 'ttb',
        note: 'pictures of words, painted and scratched: tallies and names on pots and seals (the wiki: Alzurian proto-writing, after Harappa)' },
    { id: 'alz-bone', name: 'Alzurian bone script', year: -2400, lang: 'azatin', parent: 'alz-proto', op: 'evolve', ductus: 'incised', direction: 'ttb', type: 'logosyllabic',
        steps: [['straighten', { snap: 45 }], ['simplify', { maxStrokes: 5 }]],
        changes: [['straighten', 'cut into bone with a point, the curves became angles', 'the Chinese oracle bone script (c. 1200 BC): the brush-drawn pictures cut into bone come out angular'],
            ['rebus', 'each sign read for its sound as well as its word, so a picture could write any word that sounded like it', 'Sumerian: the sign for "arrow" (ti) wrote "life" (ti); Egyptian and Chinese did the same']] },
    { id: 'alz-cursive', name: 'Alzurian cursive', year: -1700, lang: 'proto-ukhdari', parent: 'alz-bone', op: 'evolve', ductus: 'pen', direction: 'rtl', type: 'logosyllabic',
        steps: [['rotate', -90], ['cursivise', { slant: 0.08 }], ['simplify', { maxStrokes: 4 }], ['drift', 0.02]],
        changes: [['rotate', 'the signs turned a quarter when scribes turned from columns to lines written with a pen', 'cuneiform signs turned a quarter when the tablet did (c. 2500 BC)'],
            ['cursivise', 'written fast with a reed pen, strokes joined and corners rounded', 'Egyptian hieratic beside the hieroglyphs; the Alzurian cursive the wiki names'],
            ['simplify', 'the small strokes dropped', 'every cursive hand']] },
    { id: 'alz-classical', name: 'Classical Alzurian script', year: -600, lang: 'classical-ealdorii', parent: 'alz-cursive', op: 'reform', ductus: 'chisel', direction: 'rtl',
        note: 'the Alzurian states fix the signs: one for each sound, cut on monuments' },
    // the Ealdorii line
    { id: 'eald-old', name: 'Old Ealdorii script', year: -100, lang: 'old-ealdorii', parent: 'alz-classical', op: 'evolve', ductus: 'pen', direction: 'rtl',
        steps: [['cursivise', { slant: 0.1 }], ['drift', 0.03]], changes: [['cursivise', 'the everyday pen hand beside the monumental letters', 'Roman cursive beside the capitals']] },
    { id: 'eald-middle', name: 'Middle Ealdorii script', year: 700, lang: 'middle-ealdorii', parent: 'eald-old', op: 'evolve', ductus: 'pen', direction: 'rtl',
        steps: [['simplify', { maxStrokes: 3 }], ['drift', 0.03]], changes: [['simplify', 'fewer strokes still', 'the medieval minuscules']] },
    { id: 'eald', name: 'Ealdorii script in print', year: 1500, lang: 'ealdorii', parent: 'eald-middle', op: 'evolve', ductus: 'roman', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 4 }]], changes: [['print', 'the forms set in type with the standard language: every stroke to the line, every sign in the same frame', 'the printed roman of the 1470s (Jenson, Aldus); the Song typeface; the civil script of 1708']] },
    { id: 'eald-mod', name: 'Ealdorii script', year: 1700, lang: 'ealdorii', parent: 'eald', op: 'evolve', ductus: 'type', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 3 }]], changes: [['simplify', 'the modern face: one even line, the commonest signs cut to their fewest strokes', 'the sans-serif faces of the 1800s and 1900s; the simplified Chinese characters of 1956']] },
    // the Ukhdari line
    { id: 'ukh-classical', name: 'Classical Ukhdari script', year: -450, lang: 'classical-ukhdari', parent: 'alz-classical', op: 'evolve', ductus: 'chisel', direction: 'rtl',
        steps: [['drift', 0.03]], changes: [['drift', 'the Ukhdari stone-cutters\' own hand', 'the local Greek alphabets of the archaic age']] },
    { id: 'ukh-old', name: 'Old Ukhdari script', year: 100, lang: 'old-ukhdari', parent: 'ukh-classical', op: 'evolve', ductus: 'pen', direction: 'rtl',
        steps: [['cursivise', { slant: 0.12 }], ['drift', 0.03]], changes: [['cursivise', 'the pen hand', 'Roman cursive']] },
    { id: 'ukh-middle', name: 'Middle Ukhdari script', year: 794, lang: 'middle-ukhdari', parent: 'ukh-old', op: 'evolve', ductus: 'pen', direction: 'rtl',
        steps: [['simplify', { maxStrokes: 3 }], ['drift', 0.03]], changes: [['simplify', 'fewer strokes', 'the medieval minuscules']] },
    { id: 'ukh', name: 'Ukhdari script in print', year: 1420, lang: 'ukhdari', parent: 'ukh-middle', op: 'evolve', ductus: 'roman', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 4 }]], changes: [['print', 'the forms set in type with the standard language: every stroke to the line, every sign in the same frame', 'the printed roman of the 1470s (Jenson, Aldus); the Song typeface; the civil script of 1708']] },
    { id: 'ukh-mod', name: 'Ukhdari script', year: 1700, lang: 'ukhdari', parent: 'ukh', op: 'evolve', ductus: 'type', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 3 }]], changes: [['simplify', 'the modern face: one even line, the commonest signs cut to their fewest strokes', 'the sans-serif faces of the 1800s and 1900s; the simplified Chinese characters of 1956']] },
    // southern Ayuma: the Saetnde peoples take the cursive, and read it their own way
    { id: 'say', name: 'Saetnde script', year: -500, lang: 'saetnde', parent: 'alz-cursive', op: 'adopt', ductus: 'pen', direction: 'boustrophedon',
        note: 'the Saetnde peoples of southern Ayuma take the Alzurian cursive and read each sign by their own word for its picture, writing as the ox ploughs, each line the other way (the script Lastnu uses, DJ: "southern Ayuma")' },
    { id: 'say-s', name: 'Southern Saetnde script', year: -300, lang: 'southern-saetnde', parent: 'say', op: 'evolve', ductus: 'pen', direction: 'ltr',
        steps: [['drift', 0.03]], changes: [['drift', 'the southern hand, settled left to right', 'the local alphabets of early Italy; Greek settled left to right by 500 BC']] },
    { id: 'lyc-old', name: 'Old Lycroan script', year: 800, lang: 'old-lycroan', parent: 'say-s', op: 'evolve', ductus: 'pen', direction: 'ltr',
        steps: [['cursivise', { slant: 0.1 }], ['simplify', { maxStrokes: 3 }], ['drift', 0.03]], changes: [['cursivise', 'the Lycroan pen hand', 'the Carolingian minuscule (c. 800)']] },
    { id: 'lyc', name: 'Lycroan script in print', year: 1400, lang: 'lycroan', parent: 'lyc-old', op: 'evolve', ductus: 'roman', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 4 }]], changes: [['print', 'the forms set in type with the standard language: every stroke to the line, every sign in the same frame', 'the printed roman of the 1470s (Jenson, Aldus); the Song typeface; the civil script of 1708']] },
    { id: 'lyc-mod', name: 'Lycroan script', year: 1700, lang: 'lycroan', parent: 'lyc', op: 'evolve', ductus: 'type', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 3 }]], changes: [['simplify', 'the modern face: one even line, the commonest signs cut to their fewest strokes', 'the sans-serif faces of the 1800s and 1900s; the simplified Chinese characters of 1956']] },
    { id: 'ema-old', name: 'Old Emaran script', year: 800, lang: 'old-emaran', parent: 'say-s', op: 'evolve', ductus: 'pen', direction: 'ltr',
        steps: [['cursivise', { slant: 0.06 }], ['simplify', { maxStrokes: 3 }], ['drift', 0.03]], changes: [['cursivise', 'the Emaran pen hand', 'the Carolingian minuscule']] },
    { id: 'ema', name: 'Emaran script in print', year: 1397, lang: 'emaran', parent: 'ema-old', op: 'evolve', ductus: 'roman', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 4 }]], changes: [['print', 'the forms set in type with the standard language: every stroke to the line, every sign in the same frame', 'the printed roman of the 1470s (Jenson, Aldus); the Song typeface; the civil script of 1708']] },
    { id: 'ema-mod', name: 'Emaran script', year: 1700, lang: 'emaran', parent: 'ema', op: 'evolve', ductus: 'type', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 3 }]], changes: [['simplify', 'the modern face: one even line, the commonest signs cut to their fewest strokes', 'the sans-serif faces of the 1800s and 1900s; the simplified Chinese characters of 1956']] },
    { id: 'say-n', name: 'Northern Saetnde script', year: 450, lang: 'northern-saetnde', parent: 'say-s', op: 'evolve', ductus: 'pen', direction: 'ltr',
        steps: [['drift', 0.04]], changes: [['drift', 'the northern hand', 'the local alphabets']] },
    { id: 'ver', name: 'Verusan script in print', year: 1500, lang: 'verusan', parent: 'say-n', op: 'reform', ductus: 'roman', direction: 'ltr',
        note: 'the Verusan standard: signs for the sounds Verusan has grown, set in type' },
    { id: 'ver-mod', name: 'Verusan script', year: 1700, lang: 'verusan', parent: 'ver', op: 'evolve', ductus: 'type', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 3 }]], changes: [['simplify', 'the modern face: one even line, the commonest signs cut to their fewest strokes', 'the sans-serif faces of the 1800s and 1900s']] },
    // the Kaldari peoples take the bone script early, and keep the knife
    { id: 'kaal', name: 'Kaalsite script', year: -900, lang: 'ancient-kaalsite', parent: 'alz-bone', op: 'adopt', ductus: 'incised', direction: 'ttb',
        note: 'the Kaalsites take the bone script from Alzuria' },
    { id: 'kaal-old', name: 'Old Kaalsite script', year: 0, lang: 'old-kaalsite', parent: 'kaal', op: 'evolve', ductus: 'pen', direction: 'ttb',
        steps: [['cursivise', { slant: 0 }], ['drift', 0.03]], changes: [['cursivise', 'the pen', 'hieratic']] },
    { id: 'kaal-print', name: 'Modern Kaalsite script in print', year: 1300, lang: 'kaalsite', parent: 'kaal-old', op: 'evolve', ductus: 'roman', direction: 'ttb',
        steps: [['simplify', { maxStrokes: 3 }], ['typeset', { maxStrokes: 4 }]], changes: [['print', 'the forms set in type with the standard language: every stroke to the line, every sign in the same frame', 'the printed roman of the 1470s (Jenson, Aldus); the Song typeface; the civil script of 1708']] },
    { id: 'kaal-mod', name: 'Modern Kaalsite script', year: 1700, lang: 'kaalsite', parent: 'kaal-print', op: 'evolve', ductus: 'type', direction: 'ttb',
        steps: [['typeset', { maxStrokes: 3 }]], changes: [['simplify', 'the modern face: one even line, the commonest signs cut to their fewest strokes', 'the sans-serif faces of the 1800s and 1900s; the simplified Chinese characters of 1956']] },
    // Easuhura takes the classical script by sea
    { id: 'eas', name: 'Easuhuran script', year: -100, lang: 'classical-easuhuran', parent: 'alz-classical', op: 'adopt', ductus: 'pen', direction: 'rtl',
        note: 'the Easuhurans take the classical Alzurian letters' },
    { id: 'eas-print', name: 'Modern Easuhuran script in print', year: 1500, lang: 'easuhuran', parent: 'eas', op: 'evolve', ductus: 'roman', direction: 'rtl',
        steps: [['cursivise', { slant: 0.1 }], ['simplify', { maxStrokes: 3 }], ['typeset', { maxStrokes: 4 }]], changes: [['print', 'the forms set in type with the standard language: every stroke to the line, every sign in the same frame', 'the printed roman of the 1470s (Jenson, Aldus); the Song typeface; the civil script of 1708']] },
    { id: 'eas-mod', name: 'Modern Easuhuran script', year: 1700, lang: 'easuhuran', parent: 'eas-print', op: 'evolve', ductus: 'type', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 3 }]], changes: [['simplify', 'the modern face: one even line, the commonest signs cut to their fewest strokes', 'the sans-serif faces of the 1800s and 1900s; the simplified Chinese characters of 1956']] },
];
/** Who writes with a stage without being its language (the chart's constructed language). */
const USERS = { 'ema-mod': [{ lang: 'lastnu', from: 1700, note: 'Lastnu writes with the script of southern Ayuma (DJ, 28 Oct 2026)' }] };
/** Where a branch draws a hand of its own (evolve.js houseStyle): fresh at these, a little new everywhere else. */
const NEW_HAND = new Set(['alz-cursive', 'alz-classical', 'ukh-classical', 'eald-old', 'say', 'lyc-old', 'ema-old', 'say-n', 'kaal', 'eas']);

const STEP = {
    straighten: (g, rng, o) => straighten(g, rng, o),
    simplify: (g, rng, o) => simplify(g, rng, o),
    cursivise: (g, rng, o) => cursivise(g, rng, o),
    rotate: (g, rng, deg) => rotate(g, deg),
    mirror: (g) => mirror(g),
    drift: (g, rng, amount) => drift(g, rng, amount),
    standardise: (g) => standardise(g),
    typeset: (g, rng, o) => typeset(g, o),
};

const stages = new Map();
for (const spec of LINE) {
    const state = stateInWorld(spec.lang, spec.year);
    if (!state) { console.error(`${spec.id}: no state for ${spec.lang} in ${spec.year}`); continue; }
    const rng = derive(SEED, spec.id);
    let stage;
    if (spec.op === 'invent') {
        stage = inventScript({ id: spec.id, name: spec.name, year: spec.year, state, rng, ductus: spec.ductus, direction: spec.direction });
    } else {
        const parent = stages.get(spec.parent);
        if (!parent) { console.error(`${spec.id}: no parent ${spec.parent}`); continue; }
        if (spec.op === 'adopt' || spec.op === 'reform') {
            stage = adoptScript({ id: spec.id, name: spec.name, year: spec.year, donor: parent, state, rng, ductus: spec.ductus, direction: spec.direction, reform: spec.op === 'reform' });
        } else {
            const signs = parent.signs.map((s) => {
                let g = s.glyph;
                for (const [k, o] of spec.steps || []) g = STEP[k](g, derive(SEED, spec.id, s.id), o);
                return { ...s, id: `${spec.id}:${s.id.split(':').slice(1).join(':')}`, glyph: g, from: s.id };
            });
            const distinct = distinguish(signs, rng, 0.82);
            stage = {
                id: spec.id, name: spec.name, year: spec.year, language: spec.lang, type: spec.type || parent.type, direction: spec.direction || parent.direction,
                ductus: spec.ductus, signs: distinct, parent: parent.id, invented: false, inherent: parent.inherent ?? null,
                changes: (spec.changes || []).map(([kind, note, analogue]) => ({ year: spec.year, kind, note, analogue })),
            };
            // a line that settles on a direction against its nearest settled ancestor's turns its signs over
            let settled = parent;
            while (settled && settled.direction === 'boustrophedon') settled = stages.get(settled.parent);
            if (spec.direction && spec.direction !== 'boustrophedon' && settled && spec.direction !== settled.direction && !(spec.steps || []).some(([k]) => k === 'rotate' || k === 'mirror')) {
                stage.signs = stage.signs.map((s) => ({ ...s, glyph: mirror(s.glyph) }));
                stage.changes.push({ year: spec.year, kind: 'mirror', note: `the writing settled ${spec.direction === 'ltr' ? 'left to right' : 'right to left'} where ${settled.name} ran the other way: the signs turned over`, analogue: 'Greek, once it settled left to right, had mirrored the Phoenician letters' });
            }
            const fresh = distinct.filter((s) => s.markedAt === 'now');
            if (fresh.length) stage.changes.push({ year: spec.year, kind: 'marks', note: `${fresh.length} signs took a mark to be told from another`, analogue: 'the Arabic dots' });
            stage.signs = stage.signs.map((s) => ({ ...s, markedAt: undefined }));
        }
    }
    // the branch's house style: inherited, a little new, or a hand of its own
    const parentStyle = stages.get(spec.parent)?.style ?? null;
    stage.style = spec.op === 'invent' ? houseStyle(derive(SEED, spec.id, 'style'), null, 0.15)
        : houseStyle(derive(SEED, spec.id, 'style'), parentStyle, NEW_HAND.has(spec.id) ? 0.35 : 0.08);
    const typed = stage.ductus === 'roman' || stage.ductus === 'type';
    if (typed) stage.style = { ...stage.style, slant: 0 };   // print stands upright
    stage.signs = stage.signs.map((x) => ({ ...x, glyph: applyStyle(x.glyph, stage.style, parentStyle) }));
    if (NEW_HAND.has(spec.id) && parentStyle) {
        const st = stage.style, ps = parentStyle;
        const diffs = [st.aspect > ps.aspect + 0.08 ? 'wider' : st.aspect < ps.aspect - 0.08 ? 'narrower' : null, st.slant > ps.slant + 0.03 ? 'leaning more' : st.slant < ps.slant - 0.03 ? 'more upright' : null,
            st.round > ps.round + 0.25 ? 'rounder' : st.round < ps.round - 0.25 ? 'more angular' : null, st.headline && !ps.headline ? 'hung from a line' : !st.headline && ps.headline ? 'cut loose from the line' : null].filter(Boolean);
        if (diffs.length) stage.changes.push({ year: spec.year, kind: 'hand', note: `a hand of its own: ${diffs.join(', ')}`, analogue: 'Devanagari and Bengali hang from a headline, Gujarati dropped it; the southern Brahmi scripts went round on palm leaves' });
    }
    const parentStage = stages.get(spec.parent);
    /**
     * Two cases. Where a line's monumental letters (the chisel) go on beside
     * a new pen hand, the old forms stay as capitals and the pen's become the
     * small letters: Latin, Greek, Cyrillic, Armenian and Georgian are the
     * scripts that went this way, from Roman capitals and Carolingian
     * minuscule to print's A and a. The capitals change little after that.
     */
    const steps = (spec.steps || []).map(([k]) => k);
    if (steps.includes('cursivise') && parentStage?.ductus === 'chisel') {
        stage.bicameral = true;
        stage.signs = stage.signs.map((x) => { const from = parentStage.signs.find((p) => p.id === x.from); return from ? { ...x, upper: applyStyle(from.glyph, stage.style, parentStyle) } : x; });
        stage.changes.push({ year: spec.year, kind: 'two-cases', note: 'the monumental letters kept beside the pen hand: capitals and small letters', analogue: 'Roman capitals beside the Carolingian minuscule, which print made A and a' });
    } else if (parentStage?.bicameral || parentStage?.signs.some((p) => p.upper)) {
        stage.bicameral = true;
        stage.signs = stage.signs.map((x) => {
            const from = parentStage.signs.find((p) => p.id === x.from);
            if (!from?.upper) return x;
            let up = applyStyle(from.upper, stage.style, parentStyle);
            if (typed) up = typeset(up, { maxStrokes: 4 });
            else up = drift(up, derive(SEED, spec.id, x.id, 'upper'), 0.012);
            return { ...x, upper: up };
        });
    }
    /**
     * Between words: nothing at first (every ancient script ran its words
     * together), then a dot (the Latin interpunct, the Ethiopic and runic
     * dots), then the space, which medieval scribes introduced and print
     * fixed.
     */
    stage.separator = spec.year >= 700 || typed ? 'space' : stage.ductus === 'chisel' || stage.ductus === 'stylus' ? 'dot' : 'none';
    /**
     * Numerals: tallies for one to four, as every early script had them;
     * five, ten, a hundred and a thousand by the first letter of the word
     * (the Greek acrophonic numerals: Π for pente, Δ for deka, Η for
     * hekaton, Χ for khilioi; the Roman V, X, C, M came the same road), and
     * before there were letters, a bundle for five and a circle for ten (the
     * Sumerian and Egyptian signs).
     */
    const numerals = [];
    const tally = (n, vertical) => mkGlyph(Array.from({ length: n }, (_, i) => ({ pts: vertical ? [[0.2 + (i * 0.6) / Math.max(1, n - 1 || 1), 0.15], [0.2 + (i * 0.6) / Math.max(1, n - 1 || 1), 0.85]] : [[0.15, 0.2 + (i * 0.6) / Math.max(1, n - 1 || 1)], [0.85, 0.2 + (i * 0.6) / Math.max(1, n - 1 || 1)]] })));
    const vertical = stage.direction !== 'ttb';
    for (let n = 1; n <= 4; n++) numerals.push({ value: n, glyph: n === 1 ? mkGlyph([{ pts: vertical ? [[0.5, 0.15], [0.5, 0.85]] : [[0.15, 0.5], [0.85, 0.5]] }]) : tally(n, vertical), origin: 'a tally' });
    const soundSigns = stage.signs.filter((x) => x.value?.sound);
    for (const [value, word] of [[5, 'five'], [10, 'ten'], [100, 'hundred'], [1000, 'thousand']]) {
        const w = state.entries.find((e) => e.gloss === word && !e.retired && !e.paradigm);
        if (soundSigns.length && w) {
            const syl = firstSyllable(w.form);
            const first = syl.onset.length ? syl.onset[syl.onset.length - 1] : syl.vowel;
            const sign = soundSigns.find((x) => x.value.sound === first);
            if (sign) { numerals.push({ value, glyph: sign.glyph, origin: `the first letter of ${w.ipa}, "${word}"` }); continue; }
        }
        if (value === 5) numerals.push({ value, glyph: mkGlyph([{ pts: [[0.2, 0.15], [0.2, 0.85]] }, { pts: [[0.35, 0.15], [0.35, 0.85]] }, { pts: [[0.5, 0.15], [0.5, 0.85]] }, { pts: [[0.65, 0.15], [0.65, 0.85]] }, { pts: [[0.1, 0.8], [0.8, 0.2]] }]), origin: 'four tallies and a stroke through: a bundle' });
        else if (value === 10) numerals.push({ value, glyph: mkGlyph([{ pts: [[0.5, 0.2], [0.8, 0.5], [0.5, 0.8], [0.2, 0.5]], curve: true, closed: true }]), origin: 'a ring' });
    }
    stage.numerals = numerals.map((n) => ({ ...n, glyph: typed ? typeset(n.glyph, { maxStrokes: 6 }) : n.glyph }));
    stage.note = spec.note ?? null;
    stage.users = [{ lang: spec.lang, from: spec.year }, ...(USERS[spec.id] || [])];
    stages.set(spec.id, stage);
    console.log(`${spec.id.padEnd(14)} ${String(spec.year).padStart(6)}  ${stage.type.padEnd(13)} ${stage.direction.padEnd(4)} ${stage.ductus.padEnd(8)} ${String(stage.signs.length).padStart(3)} signs  ${byId.get(spec.lang)?.name ?? spec.lang}`);
}

const out = {
    _readme: 'The writing systems as a tree over time (scripts/build-scripts.js, docs/writing-systems-plan.md). Each stage: its signs (strokes in a unit box, and an SVG path inked with its ductus), their values and what each came from; its changes, dated and named. The line and dates are placeholders for DJ to change.',
    generatedAt: new Date().toISOString(),
    ductus: Object.fromEntries(Object.entries(DUCTUS).map(([k, v]) => [k, { label: v.label, note: v.note }])),
    stages: [...stages.values()].map((s) => ({
        ...s, style: { ...s.style, aspect: +s.style.aspect.toFixed(2), slant: +s.style.slant.toFixed(2), round: +s.style.round.toFixed(2), tall: +s.style.tall.toFixed(2) },
        signs: s.signs.map((x) => ({ ...x, path: toPath(x.glyph, s.ductus, 100), box: inkBox(x.glyph), strokes: x.glyph.strokes, glyph: undefined,
            upperPath: x.upper ? toPath(x.upper, s.ductus, 100) : undefined, upperBox: x.upper ? inkBox(x.upper) : undefined, upperStrokes: x.upper ? x.upper.strokes : undefined, upper: undefined })),
        marks: s.marks ? Object.fromEntries(Object.entries(s.marks).map(([v, m]) => [v, { at: m.at, from: m.from, path: toPath(m.glyph, s.ductus, 100), strokes: m.glyph.strokes }])) : null,
        numerals: (s.numerals || []).map((n) => ({ value: n.value, origin: n.origin, path: toPath(n.glyph, s.ductus, 100), box: inkBox(n.glyph) })),
    })),
};
fs.writeFileSync(path.join(root, 'data/scripts.json'), JSON.stringify(out));
console.log(`Wrote data/scripts.json: ${out.stages.length} stages.`);
