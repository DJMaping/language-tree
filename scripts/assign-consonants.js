/**
 * Gives every family a consonant-inventory size so that the families
 * together span Earth's range (WALS 1A: 16% have 6-14 consonants, 22% 15-18,
 * 36% 19-25, 17% 26-33, 10% 34 or more), and writes it into
 * data/lang-config.json as `consonantTarget`, where DJ can change any of them.
 * The proto-language keeps its most-attested consonants up to that size, or
 * gains the commonest missing ones (js/engine/phonology/inventory.js).
 *
 * DJ, 15 Oct 2026: thin the consonants toward Earth. Left alone, every family
 * landed near twenty-two. Stratified like the case systems
 * (scripts/assign-cases.js): the families are shuffled with a fixed seed and
 * the i-th takes the quantile (i + 0.5) / n of Earth's distribution, but
 * never more than four above the consonants its names use (each at least
 * 0.4% of them): thinning, which DJ asked for, never thickening. Ranking by
 * the evidence instead put every living family at 19-25, since the names of
 * all of them use 16-25 consonants. A target set by hand (no
 * consonantTargetBy, e.g. Dahen-Kino's Sinitic 25) is left alone.
 *
 *   node scripts/assign-consonants.js           show the assignment
 *   node scripts/assign-consonants.js --write   write it into lang-config.json
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mineProfile } from '../js/engine/phonology/profile.js';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cfgPath = path.join(root, 'data', 'lang-config.json');
const configs = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));
const doc = JSON.parse(fs.readFileSync(path.join(root, 'data', 'languages.json'), 'utf8'));
const BY = 'scripts/assign-consonants.js';

// Earth's spread per single count (WALS 1A, its bands spread evenly)
const earth = (n) => (n <= 14 ? 16 / 9 : n <= 18 ? 22 / 4 : n <= 25 ? 36 / 7 : n <= 33 ? 17 / 8 : 10 / 9);
const counts = Array.from({ length: 42 - 6 + 1 }, (_, i) => 6 + i);
const total = counts.reduce((s, n) => s + earth(n), 0);
const at = (u) => { let acc = 0; for (const n of counts) { acc += earth(n) / total; if (u <= acc) return n; } return counts.at(-1); };

const h = (s) => { let x = 2166136261; for (const ch of `consonants-1765|${s}`) { x ^= ch.charCodeAt(0); x = Math.imul(x, 16777619) >>> 0; } return x; };
const evidence = JSON.parse(fs.readFileSync(path.join(root, 'data', 'evidence.json'), 'utf8')).families || {};
const richness = (k) => {
    const node = doc.languages.find((l) => l.id === k || l.uid === k);
    const ids = new Set([node.id]);
    let grew = true;
    while (grew) { grew = false; for (const l of doc.languages) if (l.parentId && ids.has(l.parentId) && !ids.has(l.id)) { ids.add(l.id); grew = true; } }
    const names = doc.languages.filter((l) => ids.has(l.id)).map((l) => l.name);
    const cities = configs[k].evidence === 'names' ? [] : evidence[k]?.cities || [];
    const prof = mineProfile([...names, ...cities], { reading: configs[k].reading });
    const total = prof.consonants.reduce((n, c) => n + c.total, 0) || 1;
    return prof.consonants.filter((c) => c.total / total >= 0.004 && c.total > 2).length;
};
const fams = Object.keys(configs)
    .filter((k) => !k.startsWith('_') && doc.languages.some((l) => l.id === k || l.uid === k))
    .filter((k) => configs[k].consonantTarget == null || configs[k].consonantTargetBy === BY)
    .map((k) => ({ k, r: richness(k) }))
    .sort((a, b) => h(a.k) - h(b.k));
// Never much richer than the names show: a family whose names use 25
// consonants is not made Caucasian-sized to fill Earth's top tenth (DJ asked
// for thinning). Families with almost no evidence take their quantile as it is.
const out = fams.map(({ k, r }, i) => {
    const q = at((i + 0.5) / fams.length);
    return { k, r, name: doc.languages.find((l) => l.id === k || l.uid === k).name, n: r >= 5 ? Math.min(q, r + 4) : q };
});
for (const f of out) console.log(`${f.name.padEnd(24)} ${String(f.r).padStart(3)} consonants in its names -> ${f.n}`);

if (process.argv.includes('--write')) {
    for (const f of out) configs[f.k] = { ...configs[f.k], consonantTarget: f.n, consonantTargetBy: BY };
    const body = Object.entries(configs).map(([k, v]) => `  ${JSON.stringify(k)}: ${JSON.stringify(v, null, 2).replace(/\n/g, '\n  ')}`).join(',\n\n');
    fs.writeFileSync(cfgPath, `{\n${body}\n}\n`);
    console.log('Written to data/lang-config.json.');
}
