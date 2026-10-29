/**
 * The translator reads ordinary English whole (30 Oct 2026: "Forty people
 * came to the wedding" lost "forty" and "came", and "sailed" went
 * untranslated, once the wider vocabulary gave "sail" a noun and a verb).
 * Fifteen sentences, from the everyday to DJ's own species, translated in
 * twelve languages of every family on the chart; every word must arrive.
 *
 *   node scripts/test-translate.js
 */
import { stateInWorld } from './world.js';
import { translate } from '../js/engine/text/translate.js';

const SENTENCES = ['The old man saw a white bird on the stone.', 'My mother gives bread to the children.', 'We will go to the city tomorrow.', 'The king does not trust the merchant.',
    'Two horses drink water from the river.', 'The priest prays in the temple at night.', 'She bought salt and oil at the market.', 'The soldiers burned the village in the war.',
    'I remember the song of my grandmother.', 'The ship sailed across the sea to the island.', 'The Farl sleeps by the fire.', 'They harvest Vasis in the autumn.',
    'The wind is cold in winter.', 'Forty people came to the wedding.', 'The child is afraid of the dark forest.'];
const LANGS = ['emaran', 'lycroan', 'ealdorii', 'estijan', 'standard-dahen', 'passonin', 'casan', 'sakernlesi', 'arten', 'suenan', 'seljan', 'trian'];
let passed = 0, failed = 0;
console.log('── The translator reads ordinary English whole ──');
for (const id of LANGS) {
    const st = stateInWorld(id, 1765);
    const lost = [];
    for (const s of SENTENCES) {
        let r;
        try { r = translate(st, s); } catch (e) { lost.push(`${s} (${e.message})`); continue; }
        for (const m of r.missing || []) lost.push(`${m} in "${s}"`);
        for (const sen of r.sentences) for (const w of sen.words || []) if (w.missing) lost.push(`${w.gloss} in "${s}"`);
    }
    if (lost.length) { failed++; console.log(`  FAIL ${id}: ${lost.slice(0, 5).join('; ')}`); } else passed++;
}
console.log(`${passed} passed, ${failed} ${failed === 1 ? 'FAILED' : 'failed'}.`);
process.exit(failed ? 1 : 0);
