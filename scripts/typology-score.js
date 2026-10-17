/**
 * How Earth-like Andah's typology is: for each feature on the typology maps,
 * the share of Andah's living languages in each category against the share
 * of WALS's languages, and the distance between the two (0 = identical,
 * 100 = nothing in common). Reads data/views.json (npm run views first).
 * One world is noisy (a vowel distance moved 9 to 21 between two builds that
 * did not touch vowels), so several can be averaged:
 *
 *   npm run typology -- --views=data/views.json,views-2.json,views-3.json
 *
 *   npm run typology
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, andahValue } from '../js/views/typology-bins.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (rel) => JSON.parse(fs.readFileSync(path.resolve(root, rel), 'utf8'));
const viewsArg = process.argv.find((a) => a.startsWith('--views='))?.slice(8);
const worlds = (viewsArg ? viewsArg.split(',') : ['data/views.json']).map(json);
const views = worlds[0];
const doc = json('data/languages.json');
const earth = json('data/canon/earth-typology.json');
const parents = new Set(doc.languages.map((l) => l.parentId).filter(Boolean));
const living = doc.languages.filter((l) => !parents.has(l.id) && l.died == null && views.languages[l.id]).map((l) => l.id);

/**
 * WALS samples languages so that each genus (Dryer: a group about as deep as
 * Romance or Germanic, no more than about 2,500 years) counts roughly once; a
 * raw count of Andah's living languages lets its two biggest families outvote
 * everyone. So each language is weighted 1 / (living languages in its genus):
 * the highest ancestor that began to split within the last GENUS_YEARS. The
 * first splits under each proto-language stood in for genera before, which
 * gave Zanalaric (one proto that split about 650 AFA) thirteen votes and
 * Dahen-Kino (split from 3000 BFA) three. `--raw` counts every language once.
 */
const RAW = process.argv.includes('--raw');
const GENUS_YEARS = 2500, PRESENT = 1765;
const byId = new Map(doc.languages.map((l) => [l.id, l]));
const childrenOf = new Map();
for (const l of doc.languages) if (l.parentId) childrenOf.set(l.parentId, [...(childrenOf.get(l.parentId) || []), l]);
/** When a lineage first split in two (one child is a renaming, not a split). */
const splitYear = (id) => {
    const kids = childrenOf.get(id) || [];
    if (!kids.length) return PRESENT;
    if (kids.length === 1) return splitYear(kids[0].id);
    return Math.min(...kids.map((k) => k.born ?? PRESENT));
};
const genusOf = (id) => {
    let cur = byId.get(id);
    while (cur?.parentId && byId.get(cur.parentId) && splitYear(cur.parentId) >= PRESENT - GENUS_YEARS) cur = byId.get(cur.parentId);
    return cur.id;
};
const genusSize = new Map();
for (const id of living) genusSize.set(genusOf(id), (genusSize.get(genusOf(id)) || 0) + 1);
const weight = (id) => (RAW ? 1 : 1 / genusSize.get(genusOf(id)));
if (worlds.length > 1) console.log(`Averaged over ${worlds.length} worlds.`);
console.log(RAW ? `Every living language counts once (${living.length}).
` : `One vote per genus, as WALS samples (${genusSize.size} genera, ${living.length} living languages). --raw for every language once.
`);

let sum = 0, n = 0;
for (const [key, f] of Object.entries(FEATURES)) {
    const a = new Map(), e = new Map();
    let na = 0, ne = 0;
    for (const id of living) {
        for (const W of worlds) {
            const L = W.languages[id];
            if (!L) continue;
            const v = andahValue(key, L.features, W.families[L.family]);
            if (v) { a.set(v, (a.get(v) || 0) + weight(id)); na += weight(id); }
        }
    }
    if (f.earthCounts) {
        for (const [v, c] of Object.entries(f.earthCounts)) { e.set(v, c); ne += c; }
    } else for (const l of Object.values(earth.languages)) {
        if (l.lat == null || !(l.src[key] === 'w' || l.src[key] === 'd')) continue;
        e.set(l.v[key], (e.get(l.v[key]) || 0) + 1); ne++;
    }
    if (!ne) { console.log(`${f.label}: no WALS data\n`); continue; }
    let tv = 0;
    console.log(`${f.label} (WALS ${ne} languages)`);
    for (const v of f.values) {
        const pa = na ? (100 * (a.get(v) || 0)) / na : 0, pe = (100 * (e.get(v) || 0)) / ne;
        tv += Math.abs(pa - pe) / 2;
        if (pa || pe) console.log(`  ${v.padEnd(26)} Andah ${pa.toFixed(0).padStart(3)}%   Earth ${pe.toFixed(0).padStart(3)}%`);
    }
    console.log(`  distance ${tv.toFixed(0)}\n`);
    sum += tv; n++;
}
console.log(`Mean distance from Earth: ${(sum / n).toFixed(1)} (0 = Earth's spread exactly)`);
