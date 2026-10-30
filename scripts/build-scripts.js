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
import { drift, simplify, straighten, cursivise, rotate, mirror, standardise, distinguish, typeset, houseStyle, applyStyle, lattice, tidy, headLoops, roundHand, circlise, unframe, thaiBody, finish } from '../js/engine/script/evolve.js';
import { toPath, DUCTUS, inkBox, glyph as mkGlyph, encodeStrokes, decodeStrokes, bbox } from '../js/engine/script/strokes.js';
import { firstSyllable } from '../js/engine/script/adopt.js';
import { writeWord } from '../js/engine/script/write.js';
import { rasmScript, archScript } from '../js/engine/script/hands.js';
import { joinForms } from '../js/engine/script/joining.js';
import { vowelMarks } from '../js/engine/script/marks.js';
import { hieroScript, carryReadings } from '../js/engine/script/hiero.js';
import { logoStage, logoAdopt, squareRings, roundOut, sealify, libian, kaishu, contract, regularise } from '../js/engine/script/logo.js';
import { parseWord } from '../js/engine/features.js';
import { fit as fitGlyph, similarity } from '../js/engine/script/strokes.js';
import { lockKey, stageKeys, OWN_CHANGE } from '../js/engine/script/own.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const byId = new Map(doc.languages.map((l) => [l.id, l]));
const SEED = 'scripts/0001';

/**
 * DJ's own hand (js/engine/script/own.js; the editor and the pick-one sheet
 * in the Scripts window write it through server.js): signs he drew, by what
 * they write, and hands he picked. They go into each stage as it is built,
 * so the stages after it grow from his shapes, and win over the lock at the
 * end.
 */
const OWN_FILE = path.join(root, 'data/scripts-own.json');
const OWN_HAND = fs.existsSync(OWN_FILE) ? JSON.parse(fs.readFileSync(OWN_FILE, 'utf8')).stages || {} : {};
let ownDrawn = 0;
function ownHand(stage) {
    const mine = OWN_HAND[stage.id]?.signs;
    if (!mine) return;
    const keys = stageKeys(stage.signs);
    stage.signs = stage.signs.map((x) => {
        const o = mine[keys.get(x.id)];
        return o ? { ...x, glyph: o.s ? { strokes: o.s } : x.glyph, ...(o.u ? { upper: { strokes: o.u } } : {}), own: o.via || 'drawn' } : x;
    });
}

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
    { id: 'alz-classical', name: 'Classical Alzurian script', year: -600, lang: 'classical-ealdorii', parent: 'alz-cursive', op: 'reform', ductus: 'chisel', direction: 'rtl', after: [['lattice', { maxStrokes: 4 }]], afterChanges: [['monumental', 'the stone-cutters rebuild every letter from straight bars and round bowls on the same few points (top, middle and foot; left, centre and right), so the letters read as one set', 'the Greek and Roman monumental capitals: A E H K M N of bars, B D O P R of bowls, every letter one height']],
        note: 'the Alzurian states fix the signs: one for each sound, cut on monuments' },
    // the Ealdorii line
    { id: 'eald-old', name: 'Old Ealdorii script', year: -100, lang: 'old-ealdorii', parent: 'alz-classical', op: 'evolve', ductus: 'pen', direction: 'rtl',
        steps: [['cursivise', { slant: 0.1 }], ['drift', 0.03]], changes: [['cursivise', 'the everyday pen hand beside the monumental letters', 'Roman cursive beside the capitals']] },
    { id: 'eald-middle', name: 'Middle Ealdorii script', year: 700, lang: 'middle-ealdorii', parent: 'eald-old', op: 'evolve', ductus: 'pen', direction: 'rtl',
        steps: [['simplify', { maxStrokes: 3 }], ['drift', 0.03]], changes: [['simplify', 'fewer strokes still', 'the medieval minuscules']] },
    { id: 'eald', name: 'Ealdorii script in print', year: 1500, lang: 'ealdorii', parent: 'eald-middle', op: 'evolve', ductus: 'roman', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 4 }], ['tidy']], changes: [['print', 'the forms set in type with the standard language: every stroke to the line, every sign in the same frame', 'the printed roman of the 1470s (Jenson, Aldus); the Song typeface; the civil script of 1708']] },
    { id: 'eald-mod', name: 'Ealdorii script', year: 1700, lang: 'ealdorii', parent: 'eald', op: 'evolve', ductus: 'type', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['simplify', 'the modern face: one even line, the commonest signs cut to their fewest strokes', 'the sans-serif faces of the 1800s and 1900s; the simplified Chinese characters of 1956']] },
    // the Ukhdari line
    { id: 'ukh-classical', name: 'Classical Ukhdari script', year: -450, lang: 'classical-ukhdari', parent: 'alz-classical', op: 'evolve', ductus: 'chisel', direction: 'rtl',
        steps: [['drift', 0.03]], changes: [['drift', 'the Ukhdari stone-cutters\' own hand', 'the local Greek alphabets of the archaic age']] },
    { id: 'ukh-old', name: 'Old Ukhdari script', year: 100, lang: 'old-ukhdari', parent: 'ukh-classical', op: 'evolve', ductus: 'pen', direction: 'rtl',
        steps: [['cursivise', { slant: 0.12 }], ['drift', 0.03]], changes: [['cursivise', 'the pen hand', 'Roman cursive']] },
    { id: 'ukh-middle', name: 'Middle Ukhdari script', year: 794, lang: 'middle-ukhdari', parent: 'ukh-old', op: 'evolve', ductus: 'pen', direction: 'rtl',
        steps: [['simplify', { maxStrokes: 3 }], ['drift', 0.03]], changes: [['simplify', 'fewer strokes', 'the medieval minuscules']] },
    { id: 'ukh', name: 'Ukhdari script in print', year: 1420, lang: 'ukhdari', parent: 'ukh-middle', op: 'evolve', ductus: 'roman', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 4 }], ['tidy']], changes: [['print', 'the forms set in type with the standard language: every stroke to the line, every sign in the same frame', 'the printed roman of the 1470s (Jenson, Aldus); the Song typeface; the civil script of 1708']] },
    { id: 'ukh-mod', name: 'Ukhdari script', year: 1700, lang: 'ukhdari', parent: 'ukh', op: 'evolve', ductus: 'type', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['simplify', 'the modern face: one even line, the commonest signs cut to their fewest strokes', 'the sans-serif faces of the 1800s and 1900s; the simplified Chinese characters of 1956']] },
    // southern Ayuma: the Saetnde peoples take the cursive, and read it their own way
    { id: 'say', name: 'Saetnde script', year: -500, lang: 'saetnde', parent: 'alz-cursive', op: 'adopt', ductus: 'pen', direction: 'boustrophedon', after: [['lattice', { maxStrokes: 4, rows: 5 }]], afterChanges: [['monumental', 'the letters painted and cut on the same few points, bars and bowls, each letter one height', 'the early Greek alphabets on pots and stones, built of bars and rings']],
        note: 'the Saetnde peoples of southern Ayuma take the Alzurian cursive and read each sign by their own word for its picture, writing as the ox ploughs, each line the other way (the script Lastnu uses, DJ: "southern Ayuma")' },
    { id: 'say-s', name: 'Southern Saetnde script', year: -300, lang: 'southern-saetnde', parent: 'say', op: 'evolve', ductus: 'pen', direction: 'ltr',
        steps: [['drift', 0.03]], changes: [['drift', 'the southern hand, settled left to right', 'the local alphabets of early Italy; Greek settled left to right by 500 BC']] },
    { id: 'lyc-old', name: 'Old Lycroan script', year: 800, lang: 'old-lycroan', parent: 'say-s', op: 'evolve', ductus: 'pen', direction: 'ltr',
        steps: [['cursivise', { slant: 0.1 }], ['simplify', { maxStrokes: 3 }], ['drift', 0.03]], changes: [['cursivise', 'the Lycroan pen hand', 'the Carolingian minuscule (c. 800)']] },
    { id: 'lyc', name: 'Lycroan script in print', year: 1400, lang: 'lycroan', parent: 'lyc-old', op: 'evolve', ductus: 'roman', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 4 }], ['tidy']], changes: [['print', 'the forms set in type with the standard language: every stroke to the line, every sign in the same frame', 'the printed roman of the 1470s (Jenson, Aldus); the Song typeface; the civil script of 1708']] },
    { id: 'lyc-mod', name: 'Lycroan script', year: 1700, lang: 'lycroan', parent: 'lyc', op: 'evolve', ductus: 'type', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['simplify', 'the modern face: one even line, the commonest signs cut to their fewest strokes', 'the sans-serif faces of the 1800s and 1900s; the simplified Chinese characters of 1956'],
            ['hand', 'the round hand kept in type, as the hook of the A on the flag of Arbiya', 'the round Sinhala and Burmese faces beside the angular Devanagari']] },
    { id: 'ema-old', name: 'Old Emaran script', year: 800, lang: 'old-emaran', parent: 'say-s', op: 'evolve', ductus: 'pen', direction: 'ltr', style: { headline: false },   // the flags of Gaeiya, Raledria and Etirha: letters standing alone
        steps: [['cursivise', { slant: 0.06 }], ['simplify', { maxStrokes: 3 }], ['drift', 0.03]], changes: [['cursivise', 'the Emaran pen hand', 'the Carolingian minuscule']] },
    { id: 'ema', name: 'Emaran script in print', year: 1397, lang: 'emaran', parent: 'ema-old', op: 'evolve', ductus: 'roman', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 4 }], ['tidy']], changes: [['print', 'the forms set in type with the standard language: every stroke to the line, every sign in the same frame', 'the printed roman of the 1470s (Jenson, Aldus); the Song typeface; the civil script of 1708']] },
    { id: 'ema-mod', name: 'Emaran script', year: 1700, lang: 'emaran', parent: 'ema', op: 'evolve', ductus: 'type', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 3, snapDeg: 40, square: true }], ['tidy']], changes: [['simplify', 'the modern face: one even line, the commonest signs cut to their fewest strokes', 'the sans-serif faces of the 1800s and 1900s; the simplified Chinese characters of 1956'],
            ['square', 'the face squared: curves broken into corners, strokes to the level and the upright, as the flags of Gaeiya, Raledria and Etirha carry the letters', 'square Kufic, which set the Arabic letters on a grid of level and upright strokes; the square Hebrew script']] },
    { id: 'say-n', name: 'Northern Saetnde script', year: 450, lang: 'northern-saetnde', parent: 'say-s', op: 'evolve', ductus: 'pen', direction: 'ltr',
        steps: [['drift', 0.04]], changes: [['drift', 'the northern hand', 'the local alphabets']] },
    { id: 'ver', name: 'Verusan script in print', year: 1500, lang: 'verusan', parent: 'say-n', op: 'reform', ductus: 'roman', direction: 'ltr',
        note: 'the Verusan standard: signs for the sounds Verusan has grown, set in type' },
    { id: 'ver-mod', name: 'Verusan script', year: 1700, lang: 'verusan', parent: 'ver', op: 'evolve', ductus: 'type', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['simplify', 'the modern face: one even line, the commonest signs cut to their fewest strokes', 'the sans-serif faces of the 1800s and 1900s']] },
    // the Kaldari peoples take the bone script early, and keep the knife
    { id: 'kaal', name: 'Kaalsite script', year: -900, lang: 'ancient-kaalsite', parent: 'alz-bone', op: 'adopt', ductus: 'incised', direction: 'ttb', after: [['lattice', { maxStrokes: 4, rows: 5 }]], afterChanges: [['monumental', 'cut on wood and bone along the grain: every letter staves and twigs between the same few points', 'the runes, cut across the grain on wood: staves and twigs, no curves, no level lines']],
        note: 'the Kaalsites take the bone script from Alzuria' },
    { id: 'kaal-old', name: 'Old Kaalsite script', year: 0, lang: 'old-kaalsite', parent: 'kaal', op: 'evolve', ductus: 'pen', direction: 'ttb',
        steps: [['cursivise', { slant: 0 }], ['drift', 0.03]], changes: [['cursivise', 'the pen', 'hieratic']] },
    { id: 'kaal-print', name: 'Modern Kaalsite script in print', year: 1300, lang: 'kaalsite', parent: 'kaal-old', op: 'evolve', ductus: 'roman', direction: 'ttb',
        steps: [['simplify', { maxStrokes: 3 }], ['typeset', { maxStrokes: 4 }]], changes: [['print', 'the forms set in type with the standard language: every stroke to the line, every sign in the same frame', 'the printed roman of the 1470s (Jenson, Aldus); the Song typeface; the civil script of 1708']] },
    { id: 'kaal-mod', name: 'Modern Kaalsite script', year: 1700, lang: 'kaalsite', parent: 'kaal-print', op: 'evolve', ductus: 'type', direction: 'ttb',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['simplify', 'the modern face: one even line, the commonest signs cut to their fewest strokes', 'the sans-serif faces of the 1800s and 1900s; the simplified Chinese characters of 1956']] },
    // Easuhura takes the classical script by sea
    { id: 'eas', name: 'Easuhuran script', year: -100, lang: 'classical-easuhuran', parent: 'alz-classical', op: 'adopt', ductus: 'pen', direction: 'rtl',
        note: 'the Easuhurans take the classical Alzurian letters' },
    { id: 'eas-print', name: 'Modern Easuhuran script in print', year: 1500, lang: 'easuhuran', parent: 'eas', op: 'evolve', ductus: 'roman', direction: 'rtl',
        steps: [['cursivise', { slant: 0.1 }], ['simplify', { maxStrokes: 3 }], ['typeset', { maxStrokes: 4 }]], changes: [['print', 'the forms set in type with the standard language: every stroke to the line, every sign in the same frame', 'the printed roman of the 1470s (Jenson, Aldus); the Song typeface; the civil script of 1708']] },
    { id: 'eas-mod', name: 'Modern Easuhuran script', year: 1700, lang: 'easuhuran', parent: 'eas-print', op: 'evolve', ductus: 'type', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['simplify', 'the modern face: one even line, the commonest signs cut to their fewest strokes', 'the sans-serif faces of the 1800s and 1900s; the simplified Chinese characters of 1956']] },
];
/** Who writes with a stage without being its language (the chart's constructed language). */
/**
 * Scripts of their own, from the languages DJ named (29 Oct 2026):
 * Passonin "looks like Arabic", Osnealan "Arabic look again", Casan "looks
 * like Georgian/Armenian", and Proto-Mahen with its own. With four
 * inventions only, each is a borrowing that grew a look of its own, as
 * Arabic grew out of Aramaic and Armenian was made from Greek.
 */
const OWN = [
    { id: 'pas-old', name: 'Old Passonin script', year: -300, lang: 'passonin', parent: 'alz-classical', op: 'adopt', kind: 'abjad', ductus: 'pen', direction: 'rtl',
        note: 'the Passonin take up the classical Alzurian letters, reading them by their own words' },
    { id: 'pas', name: 'Passonin script', year: 400, lang: 'passonin', parent: 'pas-old', op: 'evolve', ductus: 'pen', direction: 'rtl', hand: 'rasm', joining: true, style: { round: 0.8, headline: false },
        changes: [['rasm', 'written fast and joined, the letters wear down onto a few shared shapes on the line, and dots above and below tell apart the letters that now share one', 'Arabic, grown out of Nabataean Aramaic: ب ت ث ن ي are one shape told apart by dots']] },
    { id: 'pas-print', name: 'Passonin script in print', year: 1600, lang: 'passonin', parent: 'pas', op: 'evolve', ductus: 'roman', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 3, grid: 24 }]], changes: [['print', 'the joined letters cut in type, each in its joining forms', 'the Naskh founts of the Arabic presses (Istanbul 1727, Bulaq 1822)']] },
    { id: 'pas-mod', name: 'Passonin script', year: 1700, lang: 'passonin', parent: 'pas-print', op: 'evolve', ductus: 'type', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 3, grid: 24 }]], changes: [['simplify', 'the modern face: one even line', 'the simplified Arabic and Persian faces of the 1900s']] },
    { id: 'osn-old', name: 'Old Osnealan script', year: 100, lang: 'osnealan', parent: 'alz-classical', op: 'adopt', ductus: 'pen', direction: 'rtl',
        note: 'Osnealan takes up the classical Alzurian letters on its own (DJ: its own script, an Arabic look)' },
    { id: 'osn', name: 'Osnealan script', year: 600, lang: 'osnealan', parent: 'osn-old', op: 'evolve', ductus: 'pen', direction: 'rtl', hand: 'rasm-squat', joining: true, style: { round: 0.8, headline: false },
        changes: [['rasm', 'joined on the line and worn to shared shapes, lower and wider than the Passonin, told apart by dots', 'Syriac, Arabic\'s sister out of Aramaic, joined and dotted in its own lower hand']] },
    { id: 'osn-mod', name: 'Osnealan script', year: 1700, lang: 'osnealan', parent: 'osn', op: 'evolve', ductus: 'type', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 3, grid: 24 }]], changes: [['simplify', 'the modern face: one even line', 'the simplified Arabic and Persian faces of the 1900s']] },
    { id: 'cas', name: 'Casan script', year: 405, lang: 'casan', parent: 'say-s', op: 'adopt', kind: 'alphabet', ductus: 'pen', direction: 'ltr', hand: 'arch', style: { round: 0.8, headline: false },
        note: 'made for Casan by one scholar from the southern Saetnde letters, every letter new (DJ: looks like Georgian or Armenian)',
        changes: [['made', 'one scholar makes a letter for every Casan sound: arches, rings and hooks on one body height, stems rising or falling, each letter its own combination', 'Armenian, made by Mesrop Mashtots in 405 from Greek; the round Georgian Mkhedruli']] },
    { id: 'cas-print', name: 'Casan script in print', year: 1550, lang: 'casan', parent: 'cas', op: 'evolve', ductus: 'roman', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 4, grid: 24 }]], changes: [['print', 'the letters cut in type', 'the Armenian presses of Venice (1512) and the Georgian of Rome (1629)']] },
    { id: 'cas-mod', name: 'Casan script', year: 1700, lang: 'casan', parent: 'cas-print', op: 'evolve', ductus: 'type', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 4, grid: 24 }]], changes: [['simplify', 'the modern face: one even line', 'the sans-serif Armenian and Georgian faces of the 1900s']] },
    { id: 'mah', name: 'Mahen wedge script', year: -1100, lang: 'proto-mahen', parent: 'alz-cursive', op: 'adopt', ductus: 'stylus', direction: 'ltr', after: [['lattice', { maxStrokes: 4, rows: 3 }]],
        note: 'Proto-Mahen writes a script of its own (DJ): the Alzurian signs taken as letters and pressed into clay with a stylus (the look is my pick, for DJ to change)',
        afterChanges: [['own', 'a letter for each sound, pressed into clay in wedges, every letter a few wedges on the same points', 'the Ugaritic alphabet (14th century BC): an alphabet written in cuneiform wedges']] },
    { id: 'veru-old', name: 'Old Veruni script', year: 200, lang: 'old-veruni', parent: 'mah', op: 'evolve', ductus: 'pen', direction: 'ltr',
        steps: [['cursivise', { slant: 0.06 }], ['simplify', { maxStrokes: 3 }]], changes: [['pen', 'the wedges written with a pen: the strokes joined, the wedge heads lost', 'the Old Persian and Ugaritic signs had no pen descendants; the Aramaic pen hand did this to the old letters']] },
    { id: 'veru-mod', name: 'Veruni script', year: 1700, lang: 'veruni', parent: 'veru-old', op: 'evolve', ductus: 'type', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['print', 'the modern face', 'the sans-serif faces of the 1900s']] },
];

/**
 * Scripts of their own for single countries (DJ, 30 Oct 2026): Acranan and
 * Zenashan write scripts "linked to Ealdorii", so each takes the Ealdorii
 * letters of its day and grows a hand of its own; Kaastini, colonised by
 * Dahe, takes the Dahen signs as Sanagara did, read with its own words.
 */
const COUNTRIES = [
    { id: 'acr', name: 'Acranan script', year: 300, lang: 'acranan', parent: 'eald-old', op: 'adopt', ductus: 'pen', direction: 'rtl',
        note: 'the Acranan take up the Old Ealdorii letters and read them by their own words (DJ: a script linked to Ealdorii)' },
    { id: 'acr-print', name: 'Acranan script in print', year: 1500, lang: 'acranan', parent: 'acr', op: 'evolve', ductus: 'roman', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 4 }], ['tidy']], changes: [['print', 'the letters cut in type', 'the printed roman of the 1470s']] },
    { id: 'acr-mod', name: 'Acranan script', year: 1700, lang: 'acranan', parent: 'acr-print', op: 'evolve', ductus: 'type', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['simplify', 'the modern face: one even line', 'the sans-serif faces of the 1900s']] },
    { id: 'zen', name: 'Zenashan script', year: 950, lang: 'zenashan', parent: 'eald-middle', op: 'adopt', ductus: 'pen', direction: 'rtl',
        note: 'the Zenashan take up the Middle Ealdorii letters and read them by their own words (DJ: a script linked to Ealdorii)' },
    { id: 'zen-mod', name: 'Zenashan script', year: 1700, lang: 'zenashan', parent: 'zen', op: 'evolve', ductus: 'type', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['print', 'the letters cut in type, then the modern face', 'the sans-serif faces of the 1900s']] },
    { id: 'kas', name: 'Kaastini script', year: 1050, lang: 'kaastini', parent: 'dah-regular', op: 'logo-adopt', ductus: 'brush', direction: 'ttb',
        note: 'Kaastini takes up the Dahen signs, each read with its own word, the Dahen reading kept beside it (DJ: colonised by Dahe, a script of its own or one close)',
        changes: [['adopt', 'the Dahen signs read with Kaastini words, the Dahen word kept as the learned reading', 'Japan took the Chinese characters up, reading them with its own words']] },
    { id: 'kas-print', name: 'Kaastini script in print', year: 1500, lang: 'kaastini', parent: 'kas', op: 'logo', ductus: 'song', direction: 'ttb', grow: 40, radicalForms: true, steps: [['typeset', { maxStrokes: 12, grid: 24, snapDeg: 12 }], ['finish', { maxStrokes: 12 }]],
        changes: [['coin', 'signs of its own for Kaastini words Dahen has none for, made the Dahen way', 'the Japanese kokuji, made of Chinese parts']] },
    { id: 'kas-mod', name: 'Kaastini script', year: 1700, lang: 'kaastini', parent: 'kas-print', op: 'logo', ductus: 'type', direction: 'ttb', grow: 20, radicalForms: true, steps: [['typeset', { maxStrokes: 12 }], ['finish', { maxStrokes: 12 }]],
        changes: [['print', 'the full forms kept in the modern face', 'Taiwan and Hong Kong kept the traditional characters']] },
    // ── more scripts of their own for single countries (DJ, 30 Oct 2026: "maybe add some more unique scripts for individual countries"):
    //    the six largest states writing a script that was not their own; each grows from the script it wrote, as on Earth. My picks, for DJ's veto.
    { id: 'yih', name: 'Yihnurdan script', year: 1100, lang: 'yihnurdan', parent: 'sak-old', op: 'adopt', ductus: 'leaf', direction: 'ltr', kind: 'abugida', style: { round: 0.8, headline: false }, metrics: true,
        after: [['roundHand', { bow: 0.12 }], ['headLoops', { share: 0.5 }]],
        note: 'Yihnurda makes the Sakernlesi letters its own, rounder and with fewer heads (my pick: Lao beside Thai)',
        afterChanges: [['own', 'the Sakernlesi letters re-cut for Yihnurdan sounds: rounder bodies, heads on half of them', 'Lao, the rounder sister of Thai, both from the Khmer script']] },
    { id: 'yih-print', name: 'Yihnurdan script in print', year: 1550, lang: 'yihnurdan', parent: 'yih', op: 'evolve', ductus: 'roman', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 4 }], ['tidy']], changes: [['print', 'the letters cut in type', 'the founts of the 1800s']] },
    { id: 'yih-mod', name: 'Yihnurdan script', year: 1700, lang: 'yihnurdan', parent: 'yih-print', op: 'evolve', ductus: 'type', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['simplify', 'the modern face: one even line', 'the sans-serif faces of the 1900s']] },

    { id: 'iar', name: 'Iarevan script', year: 900, lang: 'iarevan', parent: 'sak-old', op: 'adopt', ductus: 'pen', direction: 'ltr', kind: 'abugida', style: { headline: true, round: -0.6 },
        after: [['lattice', { maxStrokes: 3, rows: 5 }]],
        note: 'Iareva takes up the Sakernlesi letters with the Srivandha faith and makes an angular script hung from a line (my pick: Tibetan, made from an Indian script for the Buddhist books)',
        afterChanges: [['own', 'a script made for the faith: the letters squared and hung from a headline', 'Tibetan, made in the 600s from the Gupta script to write the Buddhist scriptures']] },
    { id: 'iar-print', name: 'Iarevan script in print', year: 1550, lang: 'iarevan', parent: 'iar', op: 'evolve', ductus: 'roman', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 4 }], ['tidy']], changes: [['print', 'the letters cut in type', 'the founts of the 1800s']] },
    { id: 'iar-mod', name: 'Iarevan script', year: 1700, lang: 'iarevan', parent: 'iar-print', op: 'evolve', ductus: 'type', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['simplify', 'the modern face: one even line', 'the sans-serif faces of the 1900s']] },

    { id: 'ina', name: 'Inanian script', year: 900, lang: 'inanian', parent: 'dah-regular', op: 'adopt', ductus: 'brush', direction: 'ttb', kind: 'abugida',
        after: [['contract', { maxStrokes: 2, reach: 0.4 }]],
        note: 'Inania makes sound signs out of the Dahen word-signs, each a fast-written sign read for its first syllable (my pick: the Japanese kana, cut from Chinese characters)',
        afterChanges: [['own', 'the Dahen signs written fast and read for their sounds, each worn to two strokes', 'hiragana and katakana, cut from the cursive and from parts of Chinese characters in the 800s']] },
    { id: 'ina-print', name: 'Inanian script in print', year: 1550, lang: 'inanian', parent: 'ina', op: 'evolve', ductus: 'roman', direction: 'ttb',
        steps: [['typeset', { maxStrokes: 4 }], ['tidy']], changes: [['print', 'the letters cut in type', 'the founts of the 1800s']] },
    { id: 'ina-mod', name: 'Inanian script', year: 1700, lang: 'inanian', parent: 'ina-print', op: 'evolve', ductus: 'type', direction: 'ttb',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['simplify', 'the modern face: one even line', 'the sans-serif faces of the 1900s']] },

    { id: 'jat', name: 'Jathuan script', year: 1000, lang: 'jathuan', parent: 'are-demotic', op: 'adopt', ductus: 'pen', direction: 'rtl', kind: 'alphabet',
        after: [['simplify', { maxStrokes: 3 }]],
        note: 'Jathua takes the Arten demotic signs as letters, one for each sound, vowels written (my pick: Meroitic, an alphabet made from Egyptian demotic)',
        afterChanges: [['own', 'an alphabet out of the Arten demotic: each sign read for its first sound, the vowels given letters too', 'the Meroitic script of Kush (c. 300 BC), letters taken from Egyptian demotic']] },
    { id: 'jat-print', name: 'Jathuan script in print', year: 1550, lang: 'jathuan', parent: 'jat', op: 'evolve', ductus: 'roman', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 4 }], ['tidy']], changes: [['print', 'the letters cut in type', 'the founts of the 1800s']] },
    { id: 'jat-mod', name: 'Jathuan script', year: 1700, lang: 'jathuan', parent: 'jat-print', op: 'evolve', ductus: 'type', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['simplify', 'the modern face: one even line', 'the sans-serif faces of the 1900s']] },

    { id: 'myl', name: 'Mylanese script', year: 1560, lang: 'mylanese', parent: 'ema', op: 'adopt', ductus: 'roman', direction: 'ltr', kind: 'abugida',
        note: 'one Mylanese scholar makes a sign for every syllable, taking the shapes of the Emaran letters but none of their sounds (my pick: the Cherokee syllabary)',
        afterChanges: [['made', 'the Emaran letters\' shapes, every one given a Mylanese syllable of its own', 'Sequoyah\'s Cherokee syllabary (1821), Latin letters given new values']] },
    { id: 'myl-mod', name: 'Mylanese script', year: 1700, lang: 'mylanese', parent: 'myl', op: 'evolve', ductus: 'type', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['simplify', 'the modern face: one even line', 'the sans-serif faces of the 1900s']] },
    { id: 'dor', name: 'Dorimian script', year: 1200, lang: 'dorimian', parent: 'sak-old', op: 'adopt', ductus: 'brush', direction: 'ttb', kind: 'alphabet', joining: true, style: { headline: false },
        // (refit: the contraction after the turn threw some letters four boxes out, 30 Oct 2026)
        after: [['unframe'], ['rotate', -90], ['contract', { maxStrokes: 2, reach: 0.35 }], ['straighten', { snap: 45 }], ['refit']],
        note: 'Wundry turns the Sakernlesi letters on their side and joins them down a column (my pick: the Mongolian script, from the Uyghur)',
        afterChanges: [['own', 'the letters written down the page and joined along a stem, each a stroke or two', 'the Mongolian script (1204), the Uyghur letters set vertically and joined']] },
    { id: 'dor-print', name: 'Dorimian script in print', year: 1550, lang: 'dorimian', parent: 'dor', op: 'evolve', ductus: 'roman', direction: 'ttb',
        steps: [['typeset', { maxStrokes: 4 }], ['tidy']], changes: [['print', 'the letters cut in type', 'the founts of the 1800s']] },
    { id: 'dor-mod', name: 'Dorimian script', year: 1700, lang: 'dorimian', parent: 'dor-print', op: 'evolve', ductus: 'type', direction: 'ttb',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['simplify', 'the modern face: one even line', 'the sans-serif faces of the 1900s']] },
];

/**
 * The Quian writing systems (wiki: "from about 1600 BC"; DJ: the Ankusano
 * peoples, looking like Thai and the other scripts of South-East Asia).
 * Earth's road for that look: pictures, then signs read for syllables,
 * then a reform to an abugida, each consonant with its vowel built in and
 * the others marked round it (Brahmi, 3rd century BC), then the sister
 * scripts of the palm-leaf peoples: round (Burmese, Sinhala), with loop
 * heads (Thai, Lao), hung from a line (Khmer), each its own hand.
 */
const QUIAN = [
    { id: 'qu-proto', name: 'Quian proto-writing', year: -1600, lang: 'proto-ankusano-elaian', op: 'invent', ductus: 'painted', direction: 'ltr', frame: 'round', vary: 0.05, byUse: true,
        note: 'the Quian writing systems begin with the Ankusano peoples (wiki: from about 1600 BC; DJ: the Ankusano peoples)' },
    { id: 'qu-glyph', name: 'Ankusano glyph script', year: -1250, lang: 'proto-ankusano-elaian', parent: 'qu-proto', op: 'evolve', ductus: 'brush', direction: 'ltr', type: 'logosyllabic',
        steps: [['simplify', { maxStrokes: 5 }], ['drift', 0.02]], changes: [['rebus', 'the pictures read for their sounds as well as their words', 'the Maya and Egyptian rebus signs']] },
    { id: 'qu-abugida', name: 'Ankusano letters', year: -700, lang: 'proto-ankusano-elaian', parent: 'qu-glyph', op: 'reform', kind: 'abugida', ductus: 'pen', direction: 'ltr', style: { headline: false }, after: [['unframe'], ['lattice', { maxStrokes: 4, rows: 5 }]],
        afterChanges: [['reform', 'the word-signs dropped for letters, out of their blocks: each consonant written with its vowel built in, the other vowels marked round it, every letter built on the same few points', 'the Brahmi script (3rd century BC), the mother of the scripts of India and South-East Asia']] },
    { id: 'sak-old', name: 'Old Sakernlesi script', year: -200, lang: 'sakernlesi', parent: 'qu-abugida', op: 'evolve', metrics: true, ductus: 'leaf', direction: 'ltr', style: { headline: false, round: 0.6 },
        steps: [['thaiBody']], changes: [['leaf', 'the Sakernlesi scribes write on leaf: each letter a rounded body of one height on the line, open on one side, begun from a small loop', 'Thai and Lao: ก ด ถ พ are each one stroke from a head']] },
    { id: 'sak', name: 'Sakernlesi script in print', year: 1450, lang: 'sakernlesi', parent: 'sak-old', op: 'evolve', ductus: 'roman', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 3, grid: 24 }]], changes: [['print', 'the forms set in type: every stroke to the line, every sign in the same frame', 'the Thai, Burmese and Khmer founts of the 1800s, cut by missionary and royal presses']] },
    { id: 'sak-mod', name: 'Sakernlesi script', year: 1700, lang: 'sakernlesi', parent: 'sak', op: 'evolve', ductus: 'type', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 3, grid: 24 }]], changes: [['simplify', 'the modern face: one even line', 'the sans-serif Thai faces of the 1900s, loops kept or dropped (the loopless Thai of advertising)']] },
    { id: 'mik-old', name: 'Old Mikrolean script', year: -100, lang: 'mikrolean', parent: 'qu-abugida', op: 'evolve', metrics: true, ductus: 'leaf', direction: 'ltr', style: { headline: false, round: 1 },
        steps: [['circlise'], ['drift', 0.01]], changes: [['leaf', 'the Mikrolean hand on leaf: every letter a circle, told apart by where it opens and one small stroke inside', 'Burmese, whose letters are circles and parts of circles (က ဂ င စ)']] },
    { id: 'mik', name: 'Mikrolean script in print', year: 1500, lang: 'mikrolean', parent: 'mik-old', op: 'evolve', ductus: 'roman', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 3, grid: 24 }]], changes: [['print', 'the forms set in type: every stroke to the line, every sign in the same frame', 'the Thai, Burmese and Khmer founts of the 1800s, cut by missionary and royal presses']] },
    { id: 'mik-mod', name: 'Mikrolean script', year: 1700, lang: 'mikrolean', parent: 'mik', op: 'evolve', ductus: 'type', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 3, grid: 24 }]], changes: [['simplify', 'the modern face: one even line', 'the sans-serif Thai faces of the 1900s, loops kept or dropped (the loopless Thai of advertising)']] },
    { id: 'kii-old', name: 'Old Kiiaavo script', year: 0, lang: 'kiiaavo', parent: 'qu-abugida', op: 'evolve', metrics: true, ductus: 'brush', direction: 'ltr', style: { headline: true },
        steps: [['roundHand', { bow: 0.1 }], ['headLoops', { share: 0.4 }]], changes: [['hand', 'the Kiiaavo letters hung from a line, rounded, a few begun from a loop', 'Khmer, whose letters hang from a crown and curl below it']] },
    { id: 'kii', name: 'Kiiaavo script in print', year: 1500, lang: 'kiiaavo', parent: 'kii-old', op: 'evolve', ductus: 'roman', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 4 }], ['tidy']], changes: [['print', 'the forms set in type: every stroke to the line, every sign in the same frame', 'the Thai, Burmese and Khmer founts of the 1800s, cut by missionary and royal presses']] },
    { id: 'kii-mod', name: 'Kiiaavo script', year: 1700, lang: 'kiiaavo', parent: 'kii', op: 'evolve', ductus: 'type', direction: 'ltr',
        steps: [['typeset', { maxStrokes: 4 }], ['tidy']], changes: [['simplify', 'the modern face: one even line', 'the sans-serif Thai faces of the 1900s, loops kept or dropped (the loopless Thai of advertising)']] },
    { id: 'ash', name: 'Ashonic script', year: 200, lang: 'ashonic', parent: 'qu-abugida', op: 'adopt', ductus: 'incised', direction: 'ttb', after: [['lattice', { maxStrokes: 3 }]],
        note: 'Ashonic writes a script of its own (DJ): taken from the Ankusano letters, read by its own words and cut along the grain, in columns',
        afterChanges: [['own', 'a script of its own: the Ankusano letters re-read by Ashonic words and cut on wood in columns, straight staves and twigs', 'the Batak and Rejang scripts of Sumatra, cut on bamboo, and the Ogham of Ireland']] },
    { id: 'ash-mod', name: 'Modern Ashonic script', year: 1700, lang: 'ashonic', parent: 'ash', op: 'evolve', ductus: 'type', direction: 'ttb',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['print', 'the forms set in type', 'the Batak founts of the 1800s']] },
];

/**
 * The fifth invention: Ancient Areoix Lie (DJ, 29 Oct 2026: a fifth
 * invention for the Tzinalli world, the Arten family, "in the Mesoamerican
 * manner"). Earth's road: the Olmec and Zapotec signs (c. 900-600 BC), then
 * the Maya glyphs, word-signs and syllable signs packed into rounded blocks
 * read in paired columns, painted on bark paper and carved on stelae. No
 * conquest ended it here, so it is printed today, its blocks kept.
 */
const AREOIX = [
    { id: 'are-proto', name: 'Areoix Lie proto-writing', year: -900, lang: 'proto-arten', op: 'invent', ductus: 'painted', direction: 'rtl', vary: 0.04, byUse: true,
        note: 'the signs of Ancient Areoix Lie, painted on pots and walls, each a picture standing free (DJ: a fifth invention, on Egypt\'s road)' },
    { id: 'are-hiero', name: 'Arten hieroglyphs', year: -500, lang: 'arten', parent: 'are-proto', op: 'hiero', ductus: 'relief', direction: 'rtl',
        note: 'the pictures carved in relief on stone, in rows: read as words, for their first consonants, and as the kinds of things (DJ: Egypt\'s road; the wiki\'s "Old Kingdom" of Areoix Lie)' },
    { id: 'are-hieratic', name: 'Arten hieratic', year: 100, lang: 'arten', parent: 'are-hiero', op: 'evolve', ductus: 'pen', direction: 'rtl',
        steps: [['cursivise', { slant: 0.08 }], ['simplify', { maxStrokes: 4 }], ['drift', 0.02]], changes: [['cursivise', "the scribes' fast hand on paper beside the carved pictures: each sign a few strokes of the pen", 'hieratic beside the hieroglyphs']] },
    { id: 'are-demotic', name: 'Arten demotic', year: 900, lang: 'arten', parent: 'are-hieratic', op: 'evolve', ductus: 'pen', direction: 'rtl',
        steps: [['cursivise', { slant: 0.1, join: 0.3 }], ['simplify', { maxStrokes: 3 }], ['drift', 0.02]], changes: [['cursivise', 'the everyday hand, faster still: the pictures can no longer be seen in the signs', 'demotic (from the 7th century BC)']] },
    { id: 'are-print', name: 'Arten script in print', year: 1500, lang: 'arten', parent: 'are-demotic', op: 'evolve', ductus: 'roman', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 4 }], ['tidy']], changes: [['print', 'the demotic signs cut in type', 'the Egyptian demotic never reached print alive; the Coptic and Arabic presses did']] },
    { id: 'are-mod', name: 'Arten script', year: 1700, lang: 'arten', parent: 'are-print', op: 'evolve', ductus: 'type', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['simplify', 'the modern face: one even line', 'the sans-serif faces of the 1900s']] },
];

/**
 * Estijan, a great power with no script of its own (DJ, 29 Oct 2026):
 * Kelhari, it takes the Alzurian abjad as Kelhari's script, as Persian took
 * the Arabic letters with Islam, and grows an Estijan hand of them.
 */
const ESTIJAN = [
    { id: 'est-old', name: 'Old Estijan script', year: 520, lang: 'old-estijan', parent: 'ukh-old', op: 'adopt', kind: 'abjad', ductus: 'pen', direction: 'rtl',
        note: 'the Estijan take up the Ukhdari letters with the Kelhari faith, reading them by their own words (DJ: the Alzurian abjad as Kelhari\'s script)' },
    { id: 'est-middle', name: 'Middle Estijan script', year: 850, lang: 'middle-estijan', parent: 'est-old', op: 'evolve', ductus: 'pen', direction: 'rtl',
        steps: [['cursivise', { slant: 0.1 }], ['simplify', { maxStrokes: 3 }], ['drift', 0.03]], changes: [['hand', 'the Estijan hand: the letters run and lean, a hand of its own beside the Ukhdari', 'the Persian nastaliq beside the Arabic naskh']] },
    { id: 'est-print', name: 'Estijan script in print', year: 1500, lang: 'estijan', parent: 'est-middle', op: 'evolve', ductus: 'roman', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 4 }], ['tidy']], changes: [['print', 'the letters cut in type', 'the Persian presses of the 1600s']] },
    { id: 'est-mod', name: 'Estijan script', year: 1700, lang: 'estijan', parent: 'est-print', op: 'evolve', ductus: 'type', direction: 'rtl',
        steps: [['typeset', { maxStrokes: 3 }], ['tidy']], changes: [['simplify', 'the modern face: one even line', 'the sans-serif faces of the 1900s']] },
];

/**
 * The Dahen line: word-signs to this day, like Chinese (DJ, 28 Oct 2026),
 * and the script Sanagara writes (DJ: "Sanagara shares / has a close link
 * with Dahe's script"). Canon: Dahen signs of 6600 BFA are proto-writing,
 * true writing from c. 3200 BFA, the Dehlan standardisation of 207 BFA.
 * The rest follows China's road, which this line's dates mirror: signs on
 * tortoise shells at Jiahu (c. 6600 BC) that wrote no language; the oracle
 * bones (c. 1250 BC), cut with a knife; the bronzes; the Qin small seal of
 * 221 BC, one script for an empire; the clerical script of the Han, which
 * squared the seal's curves with the brush and gave the radicals their short
 * forms; the regular script by the 300s; print in the Song face; and in the
 * 1950s the simplified characters, set left to right. Sanagara takes the
 * signs up as Japan did (the 400s), reading them with its own words, and
 * keeps the full forms, as Japan and Taiwan did.
 */
const DAHEN = [
    { id: 'dah-proto', name: 'Dahen proto-writing', year: -6600, stateYear: -4500, lang: 'proto-dahen-kino', op: 'logo', ductus: 'incised', direction: 'ttb', type: 'pictographic', pictures: 18, picturesOnly: true,
        note: 'signs cut on shells and pots that stood for things, but wrote no sentence of any language (canon: "the Dahen signs of 6600 BFA are proto-writing")',
        changes: [['invention', 'eighteen signs cut on shell and bone, each a thing; no grammar, no sounds', 'the Jiahu signs on tortoise shells, c. 6600 BC, five thousand years before the oracle bones']] },
    { id: 'dah-oracle', name: 'Dahen bone script', year: -3200, lang: 'proto-dahen-kino', parent: 'dah-proto', op: 'logo', ductus: 'incised', direction: 'ttb', grow: 260, stand: true, steps: [['straighten', { snap: 0 }], ['drift', 0.02]],
        note: 'true writing, first made at Harappa in the Aeses basin (DJ: Harappa is the city where the Dahen writing systems were first developed): every word of the language can be written, by its picture, a borrowed sign or a compound (canon: Dahen true writing c. 3200 BFA)',
        changes: [['writing', 'the pictures read as words, the grammar words written with borrowed signs, the first meaning-and-sound compounds; the beasts stood on their tails to fit the column', 'the Shang oracle bones (c. 1250 BC): about a fifth of their signs are compounds, and the horse, dog and pig stand upright']] },
    { id: 'dah-bronze', name: 'Dahen bronze script', year: -2000, lang: 'old-dahen', parent: 'dah-oracle', op: 'logo', ductus: 'cast', direction: 'ttb', grow: 220, steps: [['roundOut'], ['drift', 0.015]],
        changes: [['cast', 'the signs cast on ritual bronzes: thick, rounded, the compounds now the commonest kind of new sign', 'the Zhou bronze inscriptions']] },
    { id: 'dah-seal', name: 'Dehlan seal script', year: -207, lang: 'middle-dahen', parent: 'dah-bronze', op: 'logo', ductus: 'seal', direction: 'ttb', grow: 200, steps: [['sealify'], ['standardise']],
        note: 'the Dehlan standardisation (canon, 207 BFA): one form for every sign across the state',
        changes: [['reform', 'the Dehlan standard: one form for every sign, thin even lines, every sign in the same frame', 'the Qin small seal script of 221 BC, which Li Si set for the empire']] },
    { id: 'dah-clerical', name: 'Dahen clerical script', year: 60, lang: 'middle-dahen', parent: 'dah-seal', op: 'logo', ductus: 'brush', direction: 'ttb', grow: 150, radicalForms: true, tellApart: true, steps: [['squareRings'], ['libian', { maxStrokes: 9 }], ['regularise']],
        changes: [['brush', "the clerks rebuild every sign from six brush strokes (across, down, falling left, falling right, the dot, the turn), squaring the rings and flattening the frame: the pictures can no longer be seen, and each radical takes a short form of its own", 'the Han clerical script (the libian change): 水 became 氵 and 手 扌 in every sign that carried them, and the rings of 日 口 目 were squared']] },
    { id: 'dah-regular', name: 'Dahen regular script', year: 400, lang: 'dahen', parent: 'dah-clerical', op: 'logo', ductus: 'brush', direction: 'ttb', grow: 120, radicalForms: true, steps: [['kaishu'], ['regularise']],
        changes: [['brush', 'the regular hand: each stroke made on its own, the form every child learns', 'the Chinese regular script (kaishu), settled by the 300s']] },
    { id: 'dah-print', name: 'Dahen script in print', year: 1050, lang: 'dahen', parent: 'dah-regular', op: 'logo', ductus: 'song', direction: 'ttb', grow: 80, radicalForms: true, steps: [['typeset', { maxStrokes: 12, grid: 24, snapDeg: 12 }], ['finish', { maxStrokes: 12 }]],
        changes: [['print', 'the signs cut in wood for printing, then in movable type: thin across, thick down, every stroke to the grid', 'the Song typeface; movable type of Bi Sheng in the 1040s']] },
    { id: 'dah-mod', name: 'Simplified Dahen script', year: 1700, lang: 'standard-dahen', parent: 'dah-print', op: 'logo', ductus: 'type', direction: 'ltr', grow: 30, radicalForms: true, simplified: true, tellApart: true, steps: [['typeset', { maxStrokes: 9, grid: 24 }], ['finish', { maxStrokes: 12 }]],
        changes: [['simplify', "the signs cut down: the fast hand's run-together forms made standard, the radicals to two strokes, a compound's sound part swapped for a simpler sign that sounds as well, the lines set left to right", "the simplified characters of 1956 (馬 to 马 from the cursive, 燈 to 灯, 言 to 讠) and horizontal writing from 1955"]] },
    { id: 'san', name: 'Sanagaran script', year: 800, lang: 'sanagaran', parent: 'dah-regular', op: 'logo-adopt', ductus: 'brush', direction: 'ttb',
        note: 'Sanagara takes up the Dahen signs, each read with its own word for the meaning, the Dahen reading kept beside it (DJ: Sanagara shares the script of Dahe)',
        changes: [['adopt', "the Dahen signs read with Sanagaran words: the sign for mountain is read with Sanagara's word for mountain, and the Dahen word is kept as the learned reading", 'Japan took the Chinese characters up from the 400s, reading 山 as its own yama beside the Chinese san']] },
    { id: 'san-print', name: 'Sanagaran script in print', year: 1500, lang: 'sanagaran', parent: 'san', op: 'logo', ductus: 'song', direction: 'ttb', grow: 40, radicalForms: true, steps: [['typeset', { maxStrokes: 12, grid: 24, snapDeg: 12 }], ['finish', { maxStrokes: 12 }]],
        changes: [['coin', 'signs of its own for Sanagaran words Dahen has none for, made the Dahen way', 'the Japanese kokuji (峠 "mountain pass", 働 "work"), made of Chinese parts']] },
    { id: 'san-mod', name: 'Sanagaran script', year: 1700, lang: 'sanagaran', parent: 'san-print', op: 'logo', ductus: 'type', direction: 'ttb', grow: 20, radicalForms: true, steps: [['typeset', { maxStrokes: 12 }], ['finish', { maxStrokes: 12 }]],
        changes: [['print', 'the full forms kept in the modern face: Sanagara did not cut its signs down as Dahe did', 'Taiwan and Hong Kong kept the traditional characters; Japan cut only a few']] },
];

const USERS = {
    'ema-mod': [{ lang: 'lastnu', from: 1700, note: 'Lastnu writes with the script of southern Ayuma (DJ, 28 Oct 2026)' }],
    'lyc-old': [{ lang: 'hadan', from: 800, note: 'Hadan uses the Lycroan script (DJ, 30 Oct 2026)' }],
};
/**
 * The flags that carry a script (DJ, 28 Oct 2026: "hint that the language
 * that they use fits with their flag"). Each emblem, traced from DJ's flag
 * by scripts/trace-glyph.py into data/canon/flag-glyphs, is read as the
 * first letters of the country's name in the script of its official
 * language (DJ: "look at the languages used in the nation"; the reading
 * is my pick, DJ: "you pick per flag"), and those letters of the modern
 * face take the flag's shapes: the way a state's emblem fixes a letter
 * form. `cuts` part an emblem of more than one letter (unit-box x); the
 * first letter is the capital where the script has two cases.
 *   Arbiya: Lycroan, the A.  Etirha: Lastnu, which writes Emaran, the E.
 *   Gaeiya: Emaran, Ga.  Raledria: Emaran, the R.
 * Dahe's and Sanagara's (Dahen, Sanagaran) wait for the Dahen script.
 */
const FLAGS = [
    { country: 'Arbiya', stage: 'lyc-mod', ipa: 'arbija', language: 'Lycroan' },
    { country: 'Etirha', stage: 'ema-mod', ipa: 'etirha', language: 'Lastnu' },
    { country: 'Gaeiya', stage: 'ema-mod', ipa: 'ɡaeija', language: 'Emaran', cuts: [0.41] },
    { country: 'Raledria', stage: 'ema-mod', ipa: 'raledria', language: 'Emaran' },
];

/**
 * A new sound gets a letter. When a language gains a sound its script has no
 * letter for and none near enough to stand in, the scribes make one from the
 * nearest letter with a mark (Latin made J from I and W from V, G from C;
 * the Arabic letters for Persian p, ch, zh and g are old letters with more
 * dots). Only alphabets, abjads and abugidas; the vowels of an abjad stay
 * unwritten.
 */
function fillGaps(stage, state, spec) {
    if (!['alphabet', 'abjad', 'abugida'].includes(stage.type) || !state?.inventory) return;
    const base = (ipa) => ipa.replace(/[ʲʷʰʼ̃ː]/gu, '');
    const have = new Set(stage.signs.map((x) => x.value?.sound).filter(Boolean));
    const sounds = [...state.inventory.consonants.map((c) => [base(c.ipa), 'C']), ...(stage.type === 'abjad' ? [] : state.inventory.vowels.map((v) => [base(v.ipa), 'V']))];
    const added = [];
    for (const [snd, kind] of sounds) {
        if (have.has(snd)) continue;
        const w = writeWord(stage, parseWord(snd), null, state.phonotactics);
        if (w.length) continue;
        // the nearest letter of the same kind, by its sound (the first that shares the sound's first character, else the first of its kind)
        const same = stage.signs.filter((x) => x.value?.sound && (x.value.kind ?? (/[aeiouəɛɔɪʊɨʉɯyøœæɑɒʌɤɐ]/u.test(x.value.sound) ? 'V' : 'C')) === kind);
        const near = same.find((x) => x.value.sound[0] === snd[0]) || same[0];
        if (!near) continue;
        const glyph = { strokes: [...near.glyph.strokes.map((t) => ({ ...t, pts: t.pts.map((q) => q.slice()) })), { pts: [[0.8, 0.12], [0.9, 0.24]], curve: false, closed: false, mark: true }] };
        stage.signs.push({ id: `${stage.id}:${snd}`.replace(/[^\w:]/g, '_') + '~new', concept: null, word: null, value: { sound: snd, kind }, glyph, from: null, splitFrom: near.id, origin: `a new letter for ${snd}, a sound the language came to have: ${near.value.sound} with a mark` });
        have.add(snd); added.push(`${snd} (from ${near.value.sound})`);
    }
    if (added.length) stage.changes.push({ year: spec.year, kind: 'new-letters', note: `letters made for sounds the language came to have: ${added.join(', ')}`, analogue: 'Latin made J from I and W from V; the Persian letters p, ch, zh and g are Arabic letters with more dots' });
}

/** A glyph's strokes clipped to lo <= x <= hi, each stroke split where it leaves the range. */
function clipX(g, lo, hi) {
    const strokes = [];
    for (const st of g.strokes) {
        let cur = [];
        const inside = ([x]) => x >= lo - 1e-9 && x <= hi + 1e-9;
        for (let i = 0; i < st.pts.length; i++) {
            const p = st.pts[i];
            if (i > 0) {
                const q = st.pts[i - 1];
                for (const edge of [lo, hi]) {
                    if ((q[0] - edge) * (p[0] - edge) < 0) {
                        const t = (edge - q[0]) / (p[0] - q[0]);
                        const m = [edge, q[1] + t * (p[1] - q[1])];
                        if (inside(q)) { cur.push(m); if (cur.length > 1) strokes.push({ ...st, pts: cur, closed: false }); cur = []; }
                        else cur = [m];
                    }
                }
            }
            if (inside(p)) cur.push(p);
        }
        if (cur.length > 1) strokes.push({ ...st, pts: cur, closed: false });
    }
    return { strokes: strokes.filter((t) => Math.hypot(t.pts[0][0] - t.pts.at(-1)[0], t.pts[0][1] - t.pts.at(-1)[1]) > 0.02 || t.pts.length > 2) };
}

function lockFlags(stage, state) {
    for (const f of FLAGS.filter((x) => x.stage === stage.id)) {
        const traced = JSON.parse(fs.readFileSync(path.join(root, `data/canon/flag-glyphs/${f.country}.json`), 'utf8'));
        const edges = [0, ...(f.cuts || []), 1];
        const pieces = edges.slice(1).map((hi, i) => {
            const g = clipX({ strokes: traced.strokes }, edges[i], hi);
            // an emblem drawn wide on the flag stands to the face's height in the text, at most half as wide again as high
            const ys = g.strokes.flatMap((t) => t.pts.map((q) => q[1])), xs = g.strokes.flatMap((t) => t.pts.map((q) => q[0]));
            const w = Math.max(...xs) - Math.min(...xs), h = Math.max(...ys) - Math.min(...ys), y0 = Math.min(...ys);
            const k = h > 0 && w / h > 1.5 ? w / h / 1.5 : 1;
            return fitGlyph({ strokes: g.strokes.map((t) => ({ ...t, pts: t.pts.map(([x, y]) => [x, y0 + (y - y0) * k]) })) }, 0.12, 0.88);
        });
        const letters = writeWord(stage, parseWord(f.ipa), null, state.phonotactics).slice(0, pieces.length);
        letters.forEach(({ sign, reading }, i) => {
            const capital = i === 0 && stage.bicameral && sign.upper;
            const at = stage.signs.findIndex((x) => x.id === sign.id);
            const note = `${f.country}'s flag: the ${capital ? 'capital ' : ''}${reading} of ${f.country}${pieces.length > 1 ? ` (letter ${i + 1} of ${pieces.length})` : ''}`;
            stage.signs[at] = { ...sign, [capital ? 'upper' : 'glyph']: pieces[i], flag: { country: f.country, letter: i + 1, capital: !!capital, language: f.language }, origin: [sign.origin, note].filter(Boolean).join('; ') };
            for (const other of stage.signs) {
                if (other.id === sign.id) continue;
                const sim = similarity(pieces[i], other.glyph);
                if (sim > 0.82) console.warn(`  ${f.country}: the flag's ${reading} looks like ${other.value?.sound} (${sim.toFixed(2)})`);
            }
        });
        stage.changes.push({ year: 1700, kind: 'flag', note: `${f.country}'s flag fixes ${letters.map((l) => (l.sign.value.sound === l.reading ? l.reading : `${l.sign.value.sound} (its ${l.reading})`)).join(' and ')} in the shapes its emblem carries (${f.language})`, analogue: 'a state emblem fixing a letter form: the Hangul on the South Korean seal, the Arabic on the Saudi flag' });
    }
}

/** Where a branch draws a hand of its own (evolve.js houseStyle): fresh at these, a little new everywhere else. */
const NEW_HAND = new Set(['yih', 'iar', 'ina', 'jat', 'myl', 'dor', 'acr', 'zen', 'pas', 'osn', 'cas', 'mah', 'veru-old', 'are-hieratic', 'are-demotic', 'est-old', 'est-middle', 'alz-cursive', 'alz-classical', 'ukh-classical', 'eald-old', 'say', 'lyc-old', 'ema-old', 'say-n', 'kaal', 'eas', 'qu-abugida', 'sak-old', 'mik-old', 'kii-old', 'ash']);

const STEP = {
    // back into the unit box, as a step that turned or joined strokes can throw them out of it
    refit: (g) => fitGlyph(g),
    straighten: (g, rng, o) => straighten(g, rng, o),
    simplify: (g, rng, o) => simplify(g, rng, o),
    cursivise: (g, rng, o) => cursivise(g, rng, o),
    rotate: (g, rng, deg) => rotate(g, deg),
    mirror: (g) => mirror(g),
    drift: (g, rng, amount) => drift(g, rng, amount),
    standardise: (g) => standardise(g),
    typeset: (g, rng, o) => typeset(g, o),
    squareRings: (g) => squareRings(g),
    roundOut: (g) => roundOut(g),
    sealify: (g) => sealify(g),
    libian: (g, rng, o) => libian(g, rng, o),
    kaishu: (g) => kaishu(g),
    contract: (g, rng, o) => contract(g, rng, o),
    regularise: (g) => regularise(g),
    lattice: (g, rng, o) => lattice(g, rng, o),
    tidy: (g) => tidy(g),
    headLoops: (g, rng, o) => headLoops(g, rng, o),
    roundHand: (g, rng, o) => roundHand(g, rng, o),
    circlise: (g, rng) => circlise(g, rng),
    unframe: (g) => unframe(g),
    thaiBody: (g, rng) => thaiBody(g, rng),
    finish: (g, rng, o) => finish(g, o),
};

const stages = new Map();
const NEUTRAL = { aspect: 1, slant: 0, round: 0, headline: false, tall: 0 };
for (const spec of [...LINE, ...QUIAN, ...OWN, ...AREOIX, ...ESTIJAN, ...DAHEN, ...COUNTRIES]) {
    const state = stateInWorld(spec.lang, spec.stateYear ?? spec.year);
    if (!state) { console.error(`${spec.id}: no state for ${spec.lang} in ${spec.year}`); continue; }
    const rng = derive(SEED, spec.id);
    if (spec.op === 'logo' || spec.op === 'logo-adopt') {
        const parent = stages.get(spec.parent) ?? null;
        const steps = (spec.steps || []).map(([k, o]) => (g, r) => STEP[k](g, r, o));
        const stage = spec.op === 'logo-adopt'
            ? logoAdopt({ id: spec.id, name: spec.name, year: spec.year, donor: parent, state, ductus: spec.ductus, direction: spec.direction })
            : logoStage({ id: spec.id, name: spec.name, year: spec.year, parent, state, rng, rngFor: (key) => derive(SEED, spec.id, key), steps, grow: spec.grow || 0,
                pictures: spec.pictures, picturesOnly: spec.picturesOnly, stand: spec.stand, tellApart: spec.tellApart, ductus: spec.ductus, direction: spec.direction, type: spec.type, radicalForms: spec.radicalForms, simplified: spec.simplified });
        stage.changes = (spec.changes || []).map(([kind, note, analogue]) => ({ year: spec.year, kind, note, analogue }));
        const c = stage.counts;
        if (c?.dotted) stage.changes.push({ year: spec.year, kind: 'marks', note: `${c.dotted} signs that had fallen together with another took a dot`, analogue: '大 big, 太 too and 犬 dog; 王 king and 玉 jade' });
        if (c && parent) stage.changes.push({ year: spec.year, kind: 'count', note: `${stage.signs.length} signs: ${c.picture} pictures, ${c.compound} meaning-and-sound compounds, ${c.loans} words written with a borrowed sign, and ${c.derived} derived words written as their root's sign and an affix's`, analogue: 'the share of compounds rose from about a fifth on the oracle bones to four fifths by the Han' });
        stage.style = parent?.style ?? NEUTRAL;
        stage.separator = 'none';   // word-signs run on: Chinese has never parted its words
        ownHand(stage);
        // numerals: tallies to four, then the signs of the words (五 十 百 千 are word-signs, some of them borrowed)
        const tally = (n) => mkGlyph(Array.from({ length: n }, (_, i) => ({ pts: [[0.15, 0.2 + (i * 0.6) / Math.max(1, n - 1)], [0.85, 0.2 + (i * 0.6) / Math.max(1, n - 1)]] })));
        stage.numerals = [1, 2, 3, 4].map((n) => ({ value: n, glyph: n === 1 ? mkGlyph([{ pts: [[0.15, 0.5], [0.85, 0.5]] }]) : tally(n), origin: 'a tally' }));
        for (const [value, word] of [[5, 'five'], [10, 'ten'], [100, 'hundred'], [1000, 'thousand']]) {
            const sign = stage.signs.find((x) => x.concept === word) || stage.signs.find((x) => (x.loans || []).includes(word));
            if (sign) stage.numerals.push({ value, glyph: sign.glyph, origin: sign.concept === word ? `the sign for "${word}"` : `the sign of ${sign.concept}, borrowed for "${word}"` });
        }
        stage.note = spec.note ?? null;
        stage.users = [{ lang: spec.lang, from: spec.year }];
        delete stage.counts;
        stages.set(spec.id, stage);
        console.log(`${spec.id.padEnd(14)} ${String(spec.year).padStart(6)}  ${stage.type.padEnd(13)} ${stage.direction.padEnd(4)} ${stage.ductus.padEnd(8)} ${String(stage.signs.length).padStart(3)} signs  ${byId.get(spec.lang)?.name ?? spec.lang}${c ? `  (${c.picture} pictures, ${c.compound} compounds, ${c.loans} loans)` : ''}`);
        continue;
    }
    let stage;
    if (spec.op === 'invent') {
        stage = inventScript({ id: spec.id, name: spec.name, year: spec.year, state, rng, ductus: spec.ductus, direction: spec.direction, frame: spec.frame, vary: spec.vary, byUse: spec.byUse });
    } else {
        const parent = stages.get(spec.parent);
        if (!parent) { console.error(`${spec.id}: no parent ${spec.parent}`); continue; }
        if (spec.op === 'hiero') {
            stage = hieroScript({ id: spec.id, name: spec.name, year: spec.year, donor: parent, state, rng, ductus: spec.ductus, direction: spec.direction });
        } else if (spec.op === 'adopt' || spec.op === 'reform') {
            stage = adoptScript({ id: spec.id, name: spec.name, year: spec.year, donor: parent, state, rng, ductus: spec.ductus, direction: spec.direction, reform: spec.op === 'reform', kind: spec.kind });
        } else {
            const signs = parent.signs.map((s) => {
                let g = s.glyph;
                for (const [k, o] of spec.steps || []) g = STEP[k](g, derive(SEED, spec.id, s.id), o);
                return { ...s, id: `${spec.id}:${s.id.split(':').slice(1).join(':')}`, glyph: g, from: s.id };
            });
            const distinct = distinguish(signs, rng, 0.9);
            stage = {
                id: spec.id, name: spec.name, year: spec.year, language: spec.lang, type: spec.type || parent.type, direction: spec.direction || parent.direction,
                ductus: spec.ductus, signs: distinct, parent: parent.id, invented: false, inherent: parent.inherent ?? null,
                changes: (spec.changes || []).map(([kind, note, analogue]) => ({ year: spec.year, kind, note, analogue })),
            };
            carryReadings(stage, parent);
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
    if (spec.hand === 'rasm' || spec.hand === 'rasm-squat') stage.signs = rasmScript(stage.signs, { shape: spec.hand === 'rasm-squat' ? 'squat' : null });
    if (spec.hand === 'arch') stage.signs = archScript(stage.signs);
    if (spec.joining ?? stages.get(spec.parent)?.joining) stage.joining = true;
    if (spec.after) {
        stage.signs = stage.signs.map((x) => ({ ...x, glyph: spec.after.reduce((g, [k, o]) => STEP[k](g, derive(SEED, spec.id, x.id, 'after'), o), x.glyph) }));
        const told = distinguish(stage.signs, rng, 0.9);
        const fresh = told.filter((x) => x.markedAt === 'now').length;
        stage.signs = told.map((x) => ({ ...x, markedAt: undefined }));
        for (const [kind, note, analogue] of spec.afterChanges || []) stage.changes.push({ year: spec.year, kind, note, analogue });
        if (fresh) stage.changes.push({ year: spec.year, kind: 'marks', note: `${fresh} letters that came out alike took a mark to be told apart`, analogue: 'G made from C with a bar; the Arabic dots' });
    }
    // the branch's house style: inherited, a little new, or a hand of its own
    const parentStyle = stages.get(spec.parent)?.style ?? null;
    stage.style = spec.op === 'invent' ? houseStyle(derive(SEED, spec.id, 'style'), null, 0.15)
        : houseStyle(derive(SEED, spec.id, 'style'), parentStyle, NEW_HAND.has(spec.id) ? 0.35 : 0.08);
    /**
     * Sisters go their own ways. A branch that draws a hand of its own beside
     * sisters off the same parent takes, of a few draws, the one least like
     * theirs: Earth's sisters are each a people's hand, not a coin's toss
     * apart (Hebrew square, Syriac round, Arabic joined, all from Aramaic;
     * Gujarati dropped the headline Devanagari kept).
     */
    const sisters = [...stages.values()].filter((x) => x.parent === spec.parent && NEW_HAND.has(x.id)).map((x) => x.style);
    if (NEW_HAND.has(spec.id) && sisters.length) {
        const apart = (a, b) => Math.abs(a.aspect - b.aspect) / 0.45 + Math.abs(a.slant - b.slant) / 0.14 + Math.abs(a.round - b.round) / 2 + (a.headline !== b.headline ? 1 : 0);
        const draws = Array.from({ length: 8 }, (_, k) => ({ ...houseStyle(derive(SEED, spec.id, 'style', String(k)), parentStyle, 0.35), ...(spec.style || {}) }));
        stage.style = draws.map((d) => [Math.min(...sisters.map((t) => apart(d, t))), d]).sort((a, b) => b[0] - a[0])[0][1];
    }
    if (spec.style) stage.style = { ...stage.style, ...spec.style };
    const typed = stage.ductus === 'roman' || stage.ductus === 'type';
    if (typed) stage.style = { ...stage.style, slant: 0 };   // print stands upright
    // the hand DJ picked (the pick-one sheet), with the engine's kept beside it to go back to (scripts/patch-own.js)
    if (OWN_HAND[spec.id]?.style) { stage.engineStyle = { ...stage.style }; stage.style = { ...stage.style, ...OWN_HAND[spec.id].style }; stage.changes.push(OWN_CHANGE(spec.year)); }
    /**
     * Letters that stand on a shared line at one body height (Arabic, Thai,
     * Burmese, Georgian, Armenian) keep their place on it: a short letter
     * stays short, a tall one rises, the dots sit above and below. Where a
     * hand set the letters so (`metrics`), each one's body box is kept, and
     * every later stage puts the letter back in it after its own changes,
     * which otherwise stretch each letter alone to fill the frame.
     */
    const bodyBox = (g) => bbox({ strokes: g.strokes.filter((t) => !t.mark && !t.headline) });
    const putBack = (g, m) => {
        const b = bodyBox(g);
        const kx = b.w > 0.02 ? (m.x1 - m.x0) / b.w : 1, ky = b.h > 0.02 ? (m.y1 - m.y0) / b.h : 1;
        const ox = b.w > 0.02 ? m.x0 - b.x0 * kx : (m.x0 + m.x1) / 2 - b.x0, oy = b.h > 0.02 ? m.y0 - b.y0 * ky : (m.y0 + m.y1) / 2 - b.y0;
        return { strokes: g.strokes.map((t) => ({ ...t, pts: t.pts.map(([x, y]) => [x * kx + ox, y * ky + oy]) })) };
    };
    if (spec.metrics || spec.hand) stage.signs = stage.signs.map((x) => { const b = bodyBox(x.glyph); return { ...x, metrics: { x0: b.x0, y0: b.y0, x1: b.x1, y1: b.y1 } }; });
    else {
        const was = new Map((stages.get(spec.parent)?.signs || []).filter((x) => x.metrics).map((x) => [x.id, x.metrics]));
        if (was.size) stage.signs = stage.signs.map((x) => (was.has(x.from) ? { ...x, metrics: was.get(x.from) } : x));
    }
    stage.signs = stage.signs.map((x) => ({ ...x, glyph: applyStyle(x.glyph, stage.style, parentStyle) }));
    stage.signs = stage.signs.map((x) => (x.metrics ? { ...x, glyph: putBack(x.glyph, x.metrics) } : x));
    // the faces people read get the type designer's finishing pass (finish in evolve.js)
    if (stage.ductus === 'type' || stage.ductus === 'roman') stage.signs = stage.signs.map((x) => ({ ...x, glyph: finish(x.glyph), upper: x.upper ? finish(x.upper) : x.upper }));
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
    // the capitals of a printed face finished too (they are set after the small letters)
    if ((stage.ductus === 'type' || stage.ductus === 'roman') && stage.signs.some((x) => x.upper)) stage.signs = stage.signs.map((x) => (x.upper ? { ...x, upper: finish(x.upper) } : x));
    fillGaps(stage, state, spec);
    // an abugida's vowel marks, cut from its own vowel letters (marks.js), where it has none of its own yet
    if (stage.type === 'abugida' && !stage.marks && state?.inventory) stage.marks = vowelMarks(stage, [...new Set([...state.inventory.vowels.map((v) => v.ipa), ...stage.signs.filter((x) => x.value?.kind === 'V').map((x) => x.value.sound)])], (v) => derive(SEED, spec.id, 'mark', v));
    lockFlags(stage, state);
    // the last look: twins that the house style made since are told apart too
    {
        const told = distinguish(stage.signs, derive(SEED, spec.id, 'last'), 0.9);
        const fresh = told.filter((x) => x.markedAt === 'now').length;
        stage.signs = told.map((x) => ({ ...x, markedAt: undefined }));
        if (fresh) stage.changes.push({ year: spec.year, kind: 'marks', note: `${fresh} more letters took a mark to be told apart`, analogue: 'the Arabic dots' });
    }
    // DJ's drawings after the telling-apart, which never marks a sign he drew (and before the numerals, which take letters' shapes)
    ownHand(stage);
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

/**
 * Which script each stage belongs to: a line begins where a people takes a
 * script up (an invention, or another people's adoption) and runs through
 * every stage that evolves or reforms it. The Alzurian pictures, the bone
 * script, the cursive, the classical letters and the Ealdorii and Ukhdari
 * faces are one line (one script, reformed by its own people, as the Qin
 * seal reformed the Chinese signs); the Saetnde adoption begins another,
 * on which Lycroan, Emaran and Verusan are faces, as Fraktur and Antiqua
 * are faces of one Latin script. A change of line is a change of script
 * (build-script-history.js).
 */
const OP = new Map([...LINE, ...QUIAN, ...OWN, ...AREOIX, ...ESTIJAN, ...DAHEN, ...COUNTRIES].map((sp) => [sp.id, sp.op]));
for (const st of stages.values()) {
    let s = st;
    while (s.parent && !['invent', 'adopt', 'logo-adopt'].includes(OP.get(s.id)) && !(OP.get(s.id) === 'logo' && !stages.get(s.parent))) s = stages.get(s.parent);
    st.line = s.id;
}
/** Stroke points to two places: a hundredth of the box is finer than any pen. */
/**
 * The lock (scripts/lock-scripts.js; DJ: the scripts kept as they are while
 * the words change): every sign found in data/scripts-lock.json, by what it
 * writes, is drawn as locked; a sign that is new is drawn afresh.
 */
const LOCK = fs.existsSync(path.join(root, 'data/scripts-lock.json')) ? JSON.parse(fs.readFileSync(path.join(root, 'data/scripts-lock.json'), 'utf8')).stages : {};
let lockedSigns = 0, freshSigns = 0;
for (const s of stages.values()) {
    // DJ's own drawings win over the lock: the lock only freezes what the engine drew
    const mine = OWN_HAND[s.id]?.signs || {};
    if (!LOCK[s.id]) {
        const keys = stageKeys(s.signs);
        s.signs = s.signs.map((x) => { const o = mine[keys.get(x.id)]; if (!o) return x; ownDrawn += 1; return { ...x, glyph: o.s ? { strokes: o.s } : x.glyph, ...(o.u ? { upper: { strokes: o.u } } : {}), own: o.via || 'drawn' }; });
        continue;
    }
    const L = LOCK[s.id];
    const seen = new Set();
    s.signs = s.signs.map((x) => {
        let k = lockKey(x);
        if (seen.has(k)) k = `${k}#${x.id}`;
        seen.add(k);
        const o = mine[k];
        // (a small letter he drew keeps its locked capital, and the other way round)
        if (o) { ownDrawn += 1; const l = L.signs[k]; return { ...x, glyph: o.s ? { strokes: o.s } : l ? (l.d ? decodeStrokes(l.d) : { strokes: l.s }) : x.glyph, lockedAs: k, ...(o.u ? { upper: { strokes: o.u } } : l?.u ? { upper: { strokes: l.u } } : {}), own: o.via || 'drawn' }; }
        const l = L.signs[k];
        if (!l) { freshSigns += 1; return x; }
        lockedSigns += 1;
        const glyph = l.d ? decodeStrokes(l.d) : { strokes: l.s };
        return { ...x, glyph, lockedAs: k, ...(l.u ? { upper: { strokes: l.u } } : {}) };
    });
    // a sign drawn afresh beside locked ones must still be told from them: where it matches one, it takes a mark of its own
    // (the telling-apart step ran before the lock, so a new ʃ in Kaalian print came out the shape of the locked a, 30 Oct 2026)
    if (!s.logographic) {
        const ticks = [[[0.8, 0.12], [0.9, 0.24]], [[0.1, 0.12], [0.2, 0.24]], [[0.45, 0.02], [0.55, 0.02]], [[0.86, 0.86], [0.96, 0.96]]];
        s.signs = s.signs.map((x, i) => {
            if (L.signs[x.lockedAs] || x.own) return x;
            let g = x.glyph, n = 0;
            while (n < ticks.length && s.signs.some((y, j) => j !== i && y.glyph && similarity(g, y.glyph) >= 0.97)) g = { strokes: [...g.strokes, { pts: ticks[n++], curve: false, closed: false, mark: true }] };
            return g === x.glyph ? x : { ...x, glyph: g };
        });
    }
    for (const x of s.signs) delete x.lockedAs;
    if (s.marks && L.marks) for (const [v, m] of Object.entries(s.marks)) if (L.marks[v]) m.glyph = { strokes: L.marks[v] };
    // and a vowel mark made afresh is told from the locked ones the same way: turned over, else given a tick
    if (s.marks && L.marks) {
        const key = (g) => JSON.stringify(g.strokes.map((t) => t.pts.map(([x, y]) => [Math.round(x * 50), Math.round(y * 50)])));
        const seen = new Set(Object.entries(s.marks).filter(([v]) => L.marks[v]).map(([, m]) => key(m.glyph)));
        for (const [v, m] of Object.entries(s.marks)) {
            if (L.marks[v]) continue;
            if (seen.has(key(m.glyph))) {
                const ys = m.glyph.strokes.flatMap((t) => t.pts.map((q) => q[1])), lo = Math.min(...ys), hi = Math.max(...ys);
                m.glyph = { strokes: m.glyph.strokes.map((t) => ({ ...t, pts: t.pts.map(([x, y]) => [x, lo + hi - y]) })) };
            }
            if (seen.has(key(m.glyph))) m.glyph = { strokes: [...m.glyph.strokes, { pts: [[0.72, 0.02], [0.76, 0.1]], curve: false, closed: false }] };
            seen.add(key(m.glyph));
        }
    }
    if (s.numerals && L.numerals) for (const n of s.numerals) if (L.numerals[n.value]) n.glyph = { strokes: L.numerals[n.value] };
}
console.log(`Lock: ${lockedSigns} signs drawn as locked, ${freshSigns} new.`);
{
    const asked = Object.values(OWN_HAND).reduce((n, st) => n + Object.keys(st.signs || {}).length, 0);
    if (asked) console.log(`Own: ${ownDrawn} of DJ's signs (drawn, or in a hand he picked)${asked > ownDrawn ? `; ${asked - ownDrawn} drawn for a sound or word the stage no longer has` : ''}.`);
}
/** A telling-apart dot that a later step carried outside the letter's box (as on letters turned on their side) is set back inside, beside the letter. */
const inside = (g) => (!g?.strokes ? g : { ...g, strokes: g.strokes.map((t) => {
    if (!t.mark) return t;
    const xs = t.pts.map((q) => q[0]), ys = t.pts.map((q) => q[1]);
    const cx = (Math.min(...xs) + Math.max(...xs)) / 2, cy = (Math.min(...ys) + Math.max(...ys)) / 2;
    const dx = cx < 0.04 || cx > 1.02 ? 0.9 - cx : 0, dy = cy < 0.04 || cy > 1.02 ? 0.9 - cy : 0;
    return dx || dy ? { ...t, pts: t.pts.map(([x, y]) => [x + dx, y + dy]) } : t;
}) });
// and a letter whose own strokes reach well out of its box is fitted back into it
const overflows = (g) => { const b = inkBox(g); return b.x0 < -0.1 || b.x1 > 1.1 || b.y0 < -0.1 || b.y1 > 1.1; };
for (const s of stages.values()) if (!s.logographic) s.signs = s.signs.map((x) => { if (x.own) return x; const g = inside(x.glyph); return { ...x, glyph: g?.strokes && overflows(g) ? fitGlyph(g) : g }; });
const round2 = (strokes) => strokes.map((t) => ({ ...t, pts: t.pts.map(([x, y]) => [Math.round(x * 100) / 100, Math.round(y * 100) / 100]) }));
const out = {
    _readme: 'The writing systems as a tree over time (scripts/build-scripts.js, docs/writing-systems-plan.md). Each stage: its signs (strokes in a unit box, and an SVG path inked with its ductus), their values and what each came from; its changes, dated and named. The line and dates are placeholders for DJ to change.',
    generatedAt: new Date().toISOString(),
    ductus: Object.fromEntries(Object.entries(DUCTUS).map(([k, v]) => [k, { label: v.label, note: v.note }])),
    stages: [...stages.values()].map((s) => ({
        ...s, style: { ...s.style, aspect: +s.style.aspect.toFixed(2), slant: +s.style.slant.toFixed(2), round: +s.style.round.toFixed(2), tall: +s.style.tall.toFixed(2) },
        ...(s.engineStyle ? { engineStyle: { ...s.engineStyle, aspect: +s.engineStyle.aspect.toFixed(2), slant: +s.engineStyle.slant.toFixed(2), round: +s.engineStyle.round.toFixed(2), tall: +(s.engineStyle.tall ?? 0).toFixed(2) } } : {}),
        signs: s.signs.map((x) => ({ ...x, path: s.logographic ? undefined : toPath(x.glyph, s.ductus, 100), d: s.logographic ? encodeStrokes(x.glyph) : undefined, depth: undefined, metrics: undefined, origin: s.logographic && x.from && !x.simplifiedFrom ? undefined : x.origin, box: s.logographic ? undefined : inkBox(x.glyph), strokes: s.logographic ? undefined : round2(x.glyph.strokes), glyph: undefined,
            upperPath: x.upper ? toPath(x.upper, s.ductus, 100) : undefined, upperBox: x.upper ? inkBox(x.upper) : undefined, upperStrokes: x.upper ? x.upper.strokes : undefined, upper: undefined,
            // a joined script's letters in their places in the word (joining.js): initial, medial, final, alone
            ...(() => { const j = s.logographic ? null : joinForms(x, s); return j ? { joins: j.joins, forms: Object.fromEntries(Object.entries(j.forms).map(([k, st]) => [k, { path: toPath({ strokes: st }, s.ductus, 100), box: inkBox({ strokes: st }), strokes: round2(st) }])) } : {}; })() })),
        marks: s.marks ? Object.fromEntries(Object.entries(s.marks).map(([v, m]) => [v, { at: m.at, from: m.from, path: toPath(m.glyph, s.ductus, 100), strokes: m.glyph.strokes }])) : null,
        numerals: (s.numerals || []).map((n) => ({ value: n.value, origin: n.origin, path: toPath(n.glyph, s.ductus, 100), box: inkBox(n.glyph), strokes: round2(n.glyph.strokes) })),
    })),
};
fs.writeFileSync(path.join(root, 'data/scripts.json'), JSON.stringify(out));
console.log(`Wrote data/scripts.json: ${out.stages.length} stages.`);
