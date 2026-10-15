/**
 * How Earth-like Andah's typology is: for each feature on the typology maps,
 * the share of Andah's living languages in each category against the share
 * of WALS's languages, and the distance between the two (0 = identical,
 * 100 = nothing in common). Reads data/views.json (npm run views first).
 *
 *   npm run typology
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { FEATURES, andahValue } from '../js/views/typology-bins.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const json = (rel) => JSON.parse(fs.readFileSync(path.join(root, rel), 'utf8'));
const views = json('data/views.json');
const doc = json('data/languages.json');
const earth = json('data/canon/earth-typology.json');
const parents = new Set(doc.languages.map((l) => l.parentId).filter(Boolean));
const living = doc.languages.filter((l) => !parents.has(l.id) && l.died == null && views.languages[l.id]).map((l) => l.id);

/**
 * WALS samples languages so that each genus (a branch about as deep as
 * Romance or Germanic) counts roughly once; a raw count of Andah's living
 * languages lets its two biggest families outvote everyone. So each language
 * is weighted 1 / (living languages in its branch): every first split under
 * a family's proto-language, or the family itself if it never split, gets
 * one vote. `--raw` counts every language once instead.
 */
const RAW = process.argv.includes('--raw');
const byId = new Map(doc.languages.map((l) => [l.id, l]));
const branchOf = (id) => {
    let cur = byId.get(id), prev = cur;
    while (cur?.parentId && byId.get(cur.parentId)) { prev = cur; cur = byId.get(cur.parentId); }
    return prev === cur ? cur.id : prev.id;
};
const branchSize = new Map();
for (const id of living) branchSize.set(branchOf(id), (branchSize.get(branchOf(id)) || 0) + 1);
const weight = (id) => (RAW ? 1 : 1 / branchSize.get(branchOf(id)));
console.log(RAW ? `Every living language counts once (${living.length}).
` : `One vote per branch, as WALS samples (${branchSize.size} branches, ${living.length} living languages). --raw for every language once.
`);

let sum = 0, n = 0;
for (const [key, f] of Object.entries(FEATURES)) {
    const a = new Map(), e = new Map();
    let na = 0, ne = 0;
    for (const id of living) {
        const L = views.languages[id];
        const v = andahValue(key, L.features, views.families[L.family]);
        if (v) { a.set(v, (a.get(v) || 0) + weight(id)); na += weight(id); }
    }
    for (const l of Object.values(earth.languages)) {
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
