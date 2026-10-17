/**
 * Lastnu's words: the world language's vocabulary, built from its sources.
 *
 *   node scripts/build-lastnu.js        (npm run lastnu)
 *
 * Lastnu is constructed (DJ's chart: born about 1700, kind "constructed",
 * its sources and their weights as extraParents). It is built the way the
 * a-posteriori auxiliary languages were: each root taken from one source
 * language as it stood when Lastnu was made, more often from the heavier
 * sources, and fitted to one plain international sound system, as Zamenhof
 * took Esperanto's roots from the Romance and Germanic languages and gave
 * them five vowels and no tone. Its words for modern things are compounds of
 * those roots (js/engine/lexicon/modern.js), and every family borrows from
 * this one file, so the Lastnu word for a telephone is the same everywhere.
 *
 * Written to data/lastnu.json. Rebuild after an engine change that alters
 * the sources (it is read like views.json: stale is still consistent).
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { stateInWorld } from './world.js';
import { parseWord, wordToIpa } from '../js/engine/features.js';
import { repairHiatus, syllabify } from '../js/engine/phonology/phonotactics.js';
import { adapt } from '../js/engine/contact.js';
import { derive } from '../js/engine/rng.js';
import { MODERN, MODERN_PARTS } from '../js/engine/lexicon/modern.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data/languages.json'), 'utf8'));
const node = doc.languages.find((l) => l.id === 'lastnu');
if (!node) { console.log('No Lastnu on the chart.'); process.exit(0); }
const born = node.born ?? 1700;
const sources = (node.extraParents || []).filter((p) => p.role === 'source')
    .map((p) => ({ id: p.id, weight: p.weight ?? 1, state: stateInWorld(p.id, born) }))
    .filter((s) => s.state);
if (!sources.length) { console.log('None of Lastnu\u2019s sources has an engine yet.'); process.exit(1); }

/**
 * The plain international system: the consonants found in most of Earth's
 * larger languages and five vowels, no tone, no length. The syllable shapes
 * are the heaviest source's.
 */
const heaviest = [...sources].sort((a, b) => b.weight - a.weight)[0];
const inventory = {
    consonants: parseWord('pbtdkɡfvszʃhmnlrjw'),
    vowels: parseWord('aeiou'),
};
// Plain syllables: at most two consonants before a vowel, of the kinds most
// languages allow (pr, tr, st...), and one after it.
const phonotactics = {
    ...heaviest.state.phonotactics,
    onset: { max: 2, sonorityMinDistance: 2, forbidden: [], repair: 'deletion',
        licensedExceptions: ['pr', 'tr', 'kr', 'br', 'dr', 'ɡr', 'pl', 'kl', 'bl', 'ɡl', 'fl', 'fr', 'st', 'sp', 'sk'] },
    coda: { max: 1, allowed: ['n', 'l', 'r', 's', 'm', 'k', 't'], licensedExceptions: [] },
};
const lastnu = { inventory, phonotactics };

/**
 * Roots are CLIPPED, as the auxiliary languages clipped theirs: Volapük took
 * "vol" from world and "pük" from speak, and Esperanto's "fervojo" (railway)
 * is fer + voj + o. A whole source word glued to another gave Lastnu words of
 * five and six syllables. A root keeps at most two syllables; the first part
 * of a compound keeps one.
 */
const clip = (form, n) => {
    const syl = syllabify(form, phonotactics);
    if (syl.length <= n) return form;
    const keep = syl.slice(0, n).flatMap((x) => [...x.onset, ...x.nucleus, ...x.coda]);
    // a closed first syllable reads better than an open one before the next root
    const next = syl[n]?.onset?.[0];
    return n === 1 && next && !syl[0].coda.length && phonotactics.coda.allowed.includes(next.ipa) ? [...keep, next] : keep;
};

const words = {};
const roots = {};
for (const gloss of MODERN_PARTS) {
    const order = [];
    const rng = derive('lastnu', gloss);
    const pool = [...sources];
    while (pool.length) {
        const s = rng.pickWeighted(pool, (x) => x.weight);
        order.push(s);
        pool.splice(pool.indexOf(s), 1);
    }
    for (const s of order) {
        const e = s.state.entries.find((x) => x.gloss === gloss && !x.retired && !x.paradigm);
        if (!e) continue;
        const form = clip(adapt(e.form, lastnu), 2);
        roots[gloss] = { ipa: wordToIpa(form), from: s.id, sourceIpa: e.ipa, form };
        break;
    }
}
for (const m of MODERN) {
    const [a, b] = m.calque.map((g) => roots[g]);
    if (!a || !b) continue;
    const form = repairHiatus([...clip(a.form, 1), ...b.form], lastnu.phonotactics);
    words[m.gloss] = { ipa: wordToIpa(form), parts: [`${m.calque[0]} (${a.from} ${a.sourceIpa})`, `${m.calque[1]} (${b.from} ${b.sourceIpa})`] };
}

const out = {
    _readme: 'Built by scripts/build-lastnu.js (npm run lastnu): Lastnu\u2019s roots from its sources as they stood when it was made, and its words for modern things, which every family borrows (js/engine/lexicon/modern.js). Not canon until DJ locks it.',
    builtAt: new Date().toISOString(),
    born,
    sources: sources.map((s) => ({ id: s.id, weight: s.weight })),
    roots: Object.fromEntries(Object.entries(roots).map(([g, r]) => [g, { ipa: r.ipa, from: r.from, sourceIpa: r.sourceIpa }])),
    words,
};
fs.writeFileSync(path.join(root, 'data/lastnu.json'), `${JSON.stringify(out, null, 2)}\n`);
console.log(`Wrote data/lastnu.json: ${Object.keys(roots).length} roots from ${sources.map((s) => s.id).join(', ')}; ${Object.keys(words).length} modern words.`);
for (const [g, w] of Object.entries(words).slice(0, 12)) console.log(`  ${g.padEnd(14)} ${w.ipa}`);
